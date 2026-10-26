import { NextRequest, NextResponse } from "next/server";
import { sortPieces } from "@/lib/archive-engine";
import type { ArchivePiece } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { pieces?: ArchivePiece[] };
    if (!body.pieces?.length) {
      return NextResponse.json({ error: "请先完成分类核定" }, { status: 400 });
    }
    const sorted = sortPieces(body.pieces);
    return NextResponse.json({ data: sorted });
  } catch {
    return NextResponse.json({ error: "排序失败" }, { status: 500 });
  }
}
