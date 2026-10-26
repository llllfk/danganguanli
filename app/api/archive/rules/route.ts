import { NextRequest, NextResponse } from "next/server";
import { getRules, updateRules } from "@/lib/store";

export async function GET() {
  const rules = getRules();
  return NextResponse.json({
    data: {
      classify: rules.classify,
      sort: rules.sort,
    },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      classify?: string;
      sort?: string;
    };
    const next = updateRules({
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
