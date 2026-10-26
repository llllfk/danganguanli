import { NextResponse } from "next/server";
import { POLICY_KB } from "@/lib/data/policy-kb";

export async function GET() {
  return NextResponse.json({
    data: POLICY_KB.map((d) => ({
      id: d.id,
      title: d.title,
      sourceFile: d.sourceFile,
      content: d.content,
    })),
  });
}
