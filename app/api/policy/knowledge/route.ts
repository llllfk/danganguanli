import { NextResponse } from "next/server";
import { listPolicyDocuments } from "@/lib/repos/policy";

export async function GET() {
  try {
    const data = await listPolicyDocuments();
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取知识库失败" },
      { status: 500 }
    );
  }
}
