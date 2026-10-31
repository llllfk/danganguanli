import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSourcesByVision } from "@/lib/audit-vision";
import { runAuditFromDb, summarizeAudit } from "@/lib/repos/audit";
import { countAuditSources } from "@/lib/repos/audit-upload";
import { countPageTexts } from "@/lib/repos/page-texts";
import { addAuditRecord } from "@/lib/store";
import { query } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST 核验
 * - 默认：有出处则只跑规则比对并写报告；无出处才抽视觉/缓存
 * - forceVision：强制重读影像（清空出处后重抽，可复用 page_texts 除非 forceVision 清缓存逻辑）
 * - rebuildFromCache：无出处时优先用 page_texts 重建
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

    if (body.forceVision) {
      const v = await ensureAuditSourcesByVision(personCode, {
        force: true,
        forceVision: true,
      });
      visionNote = `强制重读影像：缓存页 ${v.fromCache}，视觉 ${v.fromVision}，写入出处 ${v.extracted}；`;
      if (v.reason === "no_page_files") {
        visionNote = "无可用扫描页文件；";
      } else if (v.reason === "vision_not_configured") {
        visionNote = "未配置视觉 Bot；";
      }
    } else if (!body.rulesOnly && before === 0) {
      const v = await ensureAuditSourcesByVision(personCode);
      if (v.extracted > 0) {
        visionNote = `补齐出处 ${v.extracted}（缓存 ${v.fromCache} 页 / 视觉 ${v.fromVision} 页）；`;
      } else if (v.reason === "vision_not_configured") {
        visionNote =
          "未配置视觉 Bot，且库中无该人出处；";
      } else if (v.reason === "no_page_files") {
        visionNote =
          "无可用首页文件（需有序扫描件或整编件带本地/S3 路径）；";
      } else if (!v.skipped && v.extracted === 0) {
        visionNote = "已尝试提取但未写出字段；";
      }
    } else {
      visionNote =
        before > 0
          ? `复用已有出处 ${before} 条，仅规则比对；`
          : "仅规则比对；";
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
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "核验失败" },
      { status: 500 }
    );
  }
}
