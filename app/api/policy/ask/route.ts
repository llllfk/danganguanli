import { NextRequest, NextResponse } from "next/server";
import { answerFromKnowledge } from "@/lib/data/policy-kb";
import { addPolicyHistory } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { question?: string };
    const question = (body.question || "").trim();
    if (!question) {
      return NextResponse.json({ error: "请输入问题或关键词" }, { status: 400 });
    }

    const result = answerFromKnowledge(question);
    addPolicyHistory(question, result.answer, result.found);

    return NextResponse.json({
      data: {
        answer: result.answer,
        found: result.found,
        sources: result.sources,
      },
    });
  } catch {
    return NextResponse.json({ error: "问答失败" }, { status: 500 });
  }
}
