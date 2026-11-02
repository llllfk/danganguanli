import { NextResponse } from "next/server";
import { CATEGORY_SHORT } from "@/lib/archive-parse";
import { listCategories } from "@/lib/repos/archive";
import type { ArchiveCategoryCode } from "@/types";

const FALLBACK = (Object.keys(CATEGORY_SHORT) as ArchiveCategoryCode[]).map(
  (code) => ({
    code,
    name: CATEGORY_SHORT[code],
  })
);

export async function GET() {
  try {
    const data = await listCategories();
    return NextResponse.json({
      data: data.length ? data : FALLBACK,
    });
  } catch (e) {
    // 库短暂不可达时仍返回内置十大类，避免核定分类下拉空白
    return NextResponse.json({
      data: FALLBACK,
      error: e instanceof Error ? e.message : "读取类目失败",
      fallback: true,
    });
  }
}
