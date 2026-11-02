import { NextRequest, NextResponse } from "next/server";
import { getRules, updateRules } from "@/lib/store";

export async function GET() {
  try {
    const rules = await getRules();
    return NextResponse.json({
      data: {
        classify: rules.classify,
        sort: rules.sort,
      },
    });
  } catch (e) {
    // 库瞬时不可达时仍返回空规则，避免前端 r.json() 遇到空 body 报错
    return NextResponse.json({
      data: { classify: "", sort: "" },
      error: e instanceof Error ? e.message : "读取规则失败",
      fallback: true,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      classify?: string;
      sort?: string;
    };
    const next = await updateRules({
      ...(body.classify !== undefined ? { classify: body.classify } : {}),
      ...(body.sort !== undefined ? { sort: body.sort } : {}),
    });
    return NextResponse.json({
      data: { classify: next.classify, sort: next.sort },
    });
  } catch {
    return NextResponse.json({ error: "规则保存失败" }, { status: 500 });
  }
}
