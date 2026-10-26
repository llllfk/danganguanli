import { NextRequest, NextResponse } from "next/server";
import { getRules, updateRules } from "@/lib/store";

export async function GET() {
  const rules = getRules();
  return NextResponse.json({
    data: {
      audit: rules.audit,
      completeness: rules.completeness,
    },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      audit?: string;
      completeness?: string;
    };
    const next = updateRules({
      ...(body.audit !== undefined ? { audit: body.audit } : {}),
      ...(body.completeness !== undefined
        ? { completeness: body.completeness }
        : {}),
    });
    return NextResponse.json({
      data: { audit: next.audit, completeness: next.completeness },
    });
  } catch {
    return NextResponse.json({ error: "规则保存失败" }, { status: 500 });
  }
}
