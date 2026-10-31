import { NextRequest, NextResponse } from "next/server";
import { getSortedGroups, sortPersonPieces } from "@/lib/repos/archive";

export async function GET(request: NextRequest) {
  try {
    const personCode =
      request.nextUrl.searchParams.get("personCode") || "00001";
    const data = await getSortedGroups(personCode);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取排序失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      personCode?: string;
    };
    const data = await sortPersonPieces(body.personCode || "00001");
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "排序失败" },
      { status: 500 }
    );
  }
}
