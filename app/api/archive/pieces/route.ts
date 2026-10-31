import { NextRequest, NextResponse } from "next/server";
import {
  listPieces,
  resetPiecesToUploaded,
  updateConfirmedCategory,
} from "@/lib/repos/archive";
import type { ArchiveCategoryCode } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const personCode =
      request.nextUrl.searchParams.get("personCode") || "00001";
    const data = await listPieces(personCode);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取材料失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      personCode?: string;
    };
    const personCode = body.personCode || "00001";
    if (body.action === "reset") {
      const data = await resetPiecesToUploaded(personCode);
      return NextResponse.json({ data });
    }
    const data = await listPieces(personCode);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "操作失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      personCode?: string;
      serialNo?: string;
      confirmedCategory?: ArchiveCategoryCode;
    };
    if (!body.serialNo || !body.confirmedCategory) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    await updateConfirmedCategory(
      body.personCode || "00001",
      body.serialNo,
      body.confirmedCategory
    );
    const data = await listPieces(body.personCode || "00001");
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失败" },
      { status: 500 }
    );
  }
}
