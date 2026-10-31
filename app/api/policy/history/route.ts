import { NextRequest, NextResponse } from "next/server";
import {
  listPolicyConversations,
  listPolicyMessages,
  listRecentPolicyQuestions,
  softDeleteConversation,
} from "@/lib/store";

/** GET ?conversationId=xxx → 该会话消息；否则返回会话列表 + 近期提问 */
export async function GET(request: NextRequest) {
  try {
    const conversationId =
      request.nextUrl.searchParams.get("conversationId") || "";
    if (conversationId) {
      const messages = await listPolicyMessages(conversationId);
      return NextResponse.json({ data: { messages, conversationId } });
    }
    const [conversations, recentQuestions] = await Promise.all([
      listPolicyConversations(),
      listRecentPolicyQuestions(5),
    ]);
    return NextResponse.json({ data: { conversations, recentQuestions } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取历史失败" },
      { status: 500 }
    );
  }
}

/** DELETE ?conversationId=xxx → 会话逻辑删除 */
export async function DELETE(request: NextRequest) {
  try {
    const conversationId =
      request.nextUrl.searchParams.get("conversationId") || "";
    if (!conversationId) {
      return NextResponse.json({ error: "缺少 conversationId" }, { status: 400 });
    }
    const n = await softDeleteConversation(conversationId);
    return NextResponse.json({ data: { ok: true, affected: n } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "删除失败" },
      { status: 500 }
    );
  }
}
