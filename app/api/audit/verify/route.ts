import { NextRequest, NextResponse } from "next/server";
import {
  ensureAuditSourcesByVision,
  repairPlaceholderTitles,
} from "@/lib/audit-vision";
import { runAuditFromDb, summarizeAudit } from "@/lib/repos/audit";
import { countAuditSources } from "@/lib/repos/audit-upload";
import { countPageTexts } from "@/lib/repos/page-texts";
import { addAuditRecord } from "@/lib/store";
import { query } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST 核验
 * - 默认逐件检查缓存，缺少可信题名时识别该件，避免部分出处跳过整批材料。
 * - forceVision：逐件重读影像；失败的件保留已有出处。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      personCode?: string;
      personName?: string;
      forceVision?: boolean;
      /** 仅规则重算，绝不调视觉（即使无出处） */
      rulesOnly?: boolean;
    };
    const personCode = body.personCode || "00001";
    let personName = body.personName;
    if (!personName) {
      const p = await query<{ person_name: string }>(
        `SELECT person_name FROM persons WHERE person_code = $1`,
        [personCode]
      );
      personName = p.rows[0]?.person_name || personCode;
    }

    let visionNote = "";
    const before = await countAuditSources(personCode);
    let failures: Array<{ materialNo: string; error: string }> = [];

    if (body.forceVision || !body.rulesOnly) {
      const v = await ensureAuditSourcesByVision(personCode, {
        forceVision: !!body.forceVision,
      });
      failures = v.failures;
      if (v.reason === "no_page_files") {
        visionNote = "无可用扫描页文件；";
      } else if (v.reason === "vision_not_configured") {
        visionNote = body.forceVision
          ? "未配置视觉 Bot；"
          : "未配置视觉 Bot，且库中无比对出处；";
      } else if (body.forceVision) {
        visionNote = `强制重读影像：缓存页 ${v.fromCache}，视觉 ${v.fromVision}，写入出处 ${v.extracted}；`;
      } else if (v.extracted > 0) {
        visionNote = `补齐出处 ${v.extracted}（缓存 ${v.fromCache} 页 / 视觉 ${v.fromVision} 页）；`;
      } else if (!v.skipped) {
        visionNote = `已处理材料题名（缓存 ${v.fromCache} 页 / 视觉 ${v.fromVision} 页）；`;
      }
      if (failures.length) {
        visionNote += `有 ${failures.length} 件识别未完成：${failures.map((f) => f.materialNo).join("、")}；再次开始检验可重试；`;
      }
    } else {
      visionNote =
        before > 0
          ? `复用已有出处 ${before} 条，仅规则比对；`
          : "仅规则比对；";
    }

    // 视觉结果已在页摘要里，但件名/出处仍可能停在「档案材料 …」——每次核验都回填
    const repaired = await repairPlaceholderTitles(personCode).catch(() => 0);
    if (repaired > 0) {
      visionNote += `已从页摘要回填题名 ${repaired} 件；`;
    }

    const report = await runAuditFromDb(personCode, personName);
    const { issueCount, summary } = summarizeAudit(report);
    const record = await addAuditRecord({
      personName,
      personCode,
      summary,
      issueCount,
      report,
    });
    const textCount = await countPageTexts(personCode);
    return NextResponse.json({
      data: {
        report,
        record,
        visionNote,
        sourceCount: await countAuditSources(personCode),
        textCount,
        failures,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "核验失败" },
      { status: 500 }
    );
  }
}
