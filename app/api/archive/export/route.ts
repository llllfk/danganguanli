import { NextRequest, NextResponse } from "next/server";
import { getSortedGroups } from "@/lib/repos/archive";
import { buildCatalogWorkbookBuffer } from "@/lib/repos/catalog-export";
import { query } from "@/lib/db";

/** 导出制式目录（对齐附件2：边框/加粗，一件一行） */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      personCode?: string;
      personName?: string;
    };
    const personCode = body.personCode || "00001";
    const sorted = await getSortedGroups(personCode);
    if (!sorted.length) {
      return NextResponse.json(
        { error: "请先完成智能分类与智能排序后再导出目录" },
        { status: 400 }
      );
    }

    let personName = body.personName;
    if (!personName) {
      const p = await query<{ person_name: string }>(
        `SELECT person_name FROM persons WHERE person_code = $1`,
        [personCode]
      );
      personName = p.rows[0]?.person_name || personCode;
    }

    const buf = await buildCatalogWorkbookBuffer(personName, sorted);
    const filename = encodeURIComponent(
      `人事档案目录_${personName}_${personCode}.xlsx`
    );

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "导出失败" },
      { status: 500 }
    );
  }
}
