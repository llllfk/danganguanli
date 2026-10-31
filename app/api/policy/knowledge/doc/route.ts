import { NextRequest, NextResponse } from "next/server";
import { findPolicyDocument } from "@/lib/repos/policy";

export const dynamic = "force-dynamic";

/** 按 id / title 取单份政策原文（供来源卡片点开） */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const id = (sp.get("id") || "").trim();
    const title = (sp.get("title") || "").trim();
    const sourceFile = (sp.get("file") || "").trim();
    if (!id && !title && !sourceFile) {
      return NextResponse.json({ error: "缺少 id 或 title" }, { status: 400 });
    }
    const doc = await findPolicyDocument({ id, title, sourceFile });
    if (!doc) {
      return NextResponse.json({ error: "未找到对应政策原文" }, { status: 404 });
    }
    return NextResponse.json({ data: doc });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取失败" },
      { status: 500 }
    );
  }
}
