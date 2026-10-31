import { NextRequest, NextResponse } from "next/server";
import { extractPersonPiecesWithVision } from "@/lib/repos/archive";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST：扣子视觉抽取材料名称 / 形成日期（按件首页） */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      personCode?: string;
      force?: boolean;
    };
    const result = await extractPersonPiecesWithVision(
      body.personCode || "00001",
      { force: Boolean(body.force) }
    );
    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "视觉提取失败" },
      { status: 500 }
    );
  }
}
