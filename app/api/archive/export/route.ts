import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import type { SortItem } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sorted?: SortItem[];
      personName?: string;
      personCode?: string;
    };
    const sorted = body.sorted || [];
    if (!sorted.length) {
      return NextResponse.json({ error: "暂无排序结果可导出" }, { status: 400 });
    }

    const rows: Array<Record<string, string | number>> = [];
    for (const group of sorted) {
      for (const item of group.items) {
        rows.push({
          类别: group.categoryName,
          分类号: group.category,
          正式编号: item.formalNo,
          材料名称: item.materialName,
          形成日期: item.formDate,
          页数: item.pageCount,
          原流水号: item.serialNo,
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "档案目录");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const bytes = new Uint8Array(buf);

    const filename = encodeURIComponent(
      `人事档案目录_${body.personName || "人员"}_${body.personCode || "00001"}.xlsx`
    );

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
