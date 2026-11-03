import { NextRequest, NextResponse } from "next/server";
import {
  listPieces,
  resetPiecesToUploaded,
  updateConfirmedCategory,
  updatePieceMeta,
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
      materialName?: string;
      formDate?: string | null;
    };
    if (!body.serialNo) {
      return NextResponse.json({ error: "缺少 serialNo" }, { status: 400 });
    }
    const personCode = body.personCode || "00001";
    const hasMeta =
      body.materialName !== undefined || body.formDate !== undefined;
    if (!body.confirmedCategory && !hasMeta) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    if (body.confirmedCategory) {
      await updateConfirmedCategory(
        personCode,
        body.serialNo,
        body.confirmedCategory
      );
    }
    if (hasMeta) {
      await updatePieceMeta(personCode, body.serialNo, {
        materialName: body.materialName,
        formDate: body.formDate,
      });
    }
    const data = await listPieces(personCode);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失败" },
      { status: 500 }
    );
  }
}
