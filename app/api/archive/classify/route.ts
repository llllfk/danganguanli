import { NextRequest, NextResponse } from "next/server";
import { buildDemoPieces, enrichPiece } from "@/lib/archive-engine";
import type { ArchivePiece } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      pieces?: Array<{ serialNo: string; personCode: string; pages?: string[] }>;
      useDemo?: boolean;
    };

    let pieces: ArchivePiece[];
    if (body.useDemo || !body.pieces?.length) {
      pieces = buildDemoPieces("00001");
    } else {
      pieces = body.pieces.map((p) =>
        enrichPiece(p.serialNo, p.personCode, p.pages || [])
      );
    }

    return NextResponse.json({ data: pieces });
  } catch {
    return NextResponse.json({ error: "分类失败" }, { status: 500 });
  }
}
