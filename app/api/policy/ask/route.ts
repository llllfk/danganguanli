import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { askCozeBot, isCozeBotConfigured } from "@/lib/coze-bot";
import {
  answerFromKnowledge,
  attachPolicyDocIds,
} from "@/lib/repos/policy";
import { addPolicyHistory, getCozeConversationId } from "@/lib/store";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const body = (await request.json()) as {
      question?: string;
      userId?: string;
      conversationId?: string;
    };
    const question = (body.question || "").trim();
    if (!question) {
      return NextResponse.json({ error: "请输入问题或关键词" }, { status: 400 });
    }

    // 左侧会话用本地 conversationId 稳定分组；扣子侧 id 另存用于续聊
    const conversationId =
      (body.conversationId || "").trim() || `conv-${randomUUID()}`;
    let cozeConversationId: string | undefined;
    if (body.conversationId) {
      cozeConversationId = await getCozeConversationId(conversationId);
    }

    let result: {
      answer: string;
      found: boolean;
      sources: Array<{
        title: string;
        excerpt: string;
        sourceFile: string;
        id?: string;
      }>;
      provider?: string;
    };

    if (isCozeBotConfigured() && process.env.COZE_API_TOKEN) {
      try {
        const bot = await askCozeBot(
          question,
          body.userId || "archive-hr-admin",
          cozeConversationId
        );
        cozeConversationId = bot.conversationId || cozeConversationId;

        // 未召回知识库切片时 found=false：用本地 policy_documents 兜底，避免空召回后编造出处
        if (!bot.found) {
          const local = await answerFromKnowledge(question);
          if (local.found) {
            result = { ...local, provider: "db-fallback" };
          } else {
            result = {
              answer: "未找到相关政策依据",
              found: false,
              sources: [],
              provider: "coze-bot",
            };
          }
        } else {
          result = {
            answer: bot.answer,
            found: bot.found,
            sources: await attachPolicyDocIds(bot.sources),
            provider: "coze-bot",
          };
        }
      } catch (e) {
        console.error("coze bot failed, fallback db", e);
        const local = await answerFromKnowledge(question);
        result = { ...local, provider: "db-fallback" };
      }
    } else {
      const local = await answerFromKnowledge(question);
      result = { ...local, provider: "db" };
    }

    if (result.sources?.length) {
      result.sources = await attachPolicyDocIds(result.sources);
    }

    const thinkingMs = Date.now() - t0;

    const saved = await addPolicyHistory({
      conversationId,
      question,
      answer: result.answer,
      found: result.found,
      thinkingMs,
      provider: result.provider,
      cozeConversationId,
      sources: result.sources,
    });

    return NextResponse.json({
      data: {
        answer: result.answer,
        found: result.found,
        sources: result.sources,
        provider: result.provider,
        conversationId,
        cozeConversationId,
        thinkingMs,
        createdAt: saved.createdAt,
        id: saved.id,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "问答失败" },
      { status: 500 }
    );
  }
}
