/**
 * 扣子智能体对话（政策问答）
 * Bot: https://www.coze.cn/space/.../bot/7700834694778617891
 * 自定义环境变量请用 POLICY_BOT_ID / API_TOKEN（勿用 COZE_ 前缀）
 */

import { cozeApiBase, cozeApiToken, policyBotId } from "@/lib/coze-env";

const API = cozeApiBase();

function token() {
  const t = cozeApiToken();
  if (!t) throw new Error("未配置 API_TOKEN（或本地 COZE_API_TOKEN），无法调用扣子智能体");
  return t;
}

function botId() {
  return policyBotId();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ChatData = {
  id: string;
  conversation_id: string;
  status: string;
  last_error?: { code: number; msg: string } | null;
};

type Msg = {
  id: string;
  role: string;
  type: string;
  content: string;
  content_type?: string;
};

export type CozeAskResult = {
  answer: string;
  found: boolean;
  /** 本次对话是否实际召回了知识库切片（空召回时不能当真） */
  knowledgeRecalled: boolean;
  sources: Array<{ title: string; excerpt: string; sourceFile: string }>;
  conversationId: string;
  chatId: string;
};

async function cozeFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json()) as {
    code: number;
    msg: string;
    data?: unknown;
  };
  if (json.code !== 0) {
    throw new Error(`扣子接口错误 ${json.code}: ${json.msg || res.statusText}`);
  }
  return json;
}

/** 非流式发起对话并轮询至完成；可传入已有扣子 conversation_id 续聊 */
export async function askCozeBot(
  question: string,
  userId = "archive-hr-admin",
  cozeConvId?: string
): Promise<CozeAskResult> {
  const payload: Record<string, unknown> = {
    bot_id: botId(),
    user_id: userId,
    stream: false,
    auto_save_history: true,
    additional_messages: [
      {
        role: "user",
        content: question,
        content_type: "text",
      },
    ],
  };
  if (cozeConvId) {
    payload.conversation_id = cozeConvId;
  }

  const started = await cozeFetch("/v3/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const chat = started.data as ChatData;
  const convId = chat.conversation_id;
  const chatId = chat.id;

  let status = chat.status;
  // 最多约 45s，超时走上层 DB 兜底，避免浏览器长时间挂起后 Failed to fetch
  for (let i = 0; i < 30; i++) {
    if (
      status === "completed" ||
      status === "failed" ||
      status === "canceled" ||
      status === "requires_action"
    ) {
      break;
    }
    await sleep(1500);
    const detail = await cozeFetch(
      `/v3/chat/retrieve?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`
    );
    const d = detail.data as ChatData;
    status = d.status;
    if (d.last_error?.code) {
      throw new Error(`智能体对话失败: ${d.last_error.msg || d.last_error.code}`);
    }
  }

  if (status !== "completed") {
    throw new Error(`智能体对话未完成，状态: ${status}`);
  }

  const msgRes = await cozeFetch(
    `/v3/chat/message/list?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`
  );
  const messages = (msgRes.data as Msg[]) || [];

  const answers = messages
    .filter((m) => m.role === "assistant" && m.type === "answer" && m.content)
    .map((m) => m.content.trim());
  const answer = answers.join("\n").trim() || "未找到相关政策依据";

  const knowledgeSlices: string[] = [];
  for (const m of messages) {
    if (m.type === "knowledge" && m.content) {
      knowledgeSlices.push(m.content);
    }
    if (m.type === "verbose" && m.content?.includes("knowledge_recall")) {
      try {
        const outer = JSON.parse(m.content) as {
          msg_type?: string;
          data?: string;
        };
        if (outer.msg_type === "knowledge_recall" && outer.data) {
          const inner = JSON.parse(outer.data) as {
            chunks?: Array<{
              slice?: string;
              document_name?: string;
              meta?: {
                document?: { name?: string };
                card?: { title?: string };
                link?: { title?: string };
              };
            }>;
          };
          for (const c of inner.chunks || []) {
            if (!c.slice) continue;
            // 扣子实际字段在 meta.document.name，不是顶层 document_name
            const docName =
              c.meta?.document?.name ||
              c.meta?.card?.title ||
              c.meta?.link?.title ||
              c.document_name ||
              "";
            knowledgeSlices.push(
              `${docName || titleFromSlice(c.slice) || "知识库"}::${c.slice}`
            );
          }
        }
      } catch {
        /* ignore parse */
      }
    }
  }

  const notFound =
    /未找到相关政策依据/.test(answer) ||
    /无法回答这个?问题/.test(answer) ||
    /无法识别/.test(answer) ||
    /没有相关(政策|依据|内容|结果)/.test(answer) ||
    /抱歉[，,].{0,12}没有找到/.test(answer) ||
    /无法给到相关/.test(answer) ||
    /无法提供相关/.test(answer) ||
    /我(无法|不能).{0,8}(找到|检索|回答)/.test(answer);
  // 寒暄/自我介绍不算「有政策依据」，但不强制改写成未找到
  const isGreeting =
    /你好|您好|我是|助手|请问有什么|有什么(可以|能)帮/.test(answer) &&
    answer.length < 220 &&
    !/条例|规范|第四类|第九类|出生日期|三龄/.test(answer);
  // 知识库节点未召回任何切片时，即便模型写了「明确答复」也视为无依据，交给本地库兜底
  const hasKnowledge = knowledgeSlices.length > 0;
  const found = hasKnowledge && !notFound && !isGreeting;
  const sources = found
    ? parseSourcesFromAnswer(answer, knowledgeSlices)
    : [];
  const normalizedAnswer =
    notFound || !hasKnowledge
      ? hasKnowledge
        ? "未找到相关政策依据"
        : answer
      : answer;

  return {
    answer: normalizedAnswer,
    found,
    sources,
    conversationId: convId,
    chatId,
    knowledgeRecalled: hasKnowledge,
  };
}

function titleFromSlice(slice: string) {
  const m = slice.match(/《([^》]{4,80})》/);
  return m ? m[1] : "";
}

function parseSourcesFromAnswer(
  answer: string,
  knowledgeSlices: string[]
): Array<{ title: string; excerpt: string; sourceFile: string }> {
  const sources: Array<{ title: string; excerpt: string; sourceFile: string }> =
    [];
  const seen = new Set<string>();

  function push(title: string, excerpt: string, sourceFile?: string) {
    const key = (title || sourceFile || excerpt.slice(0, 40))
      .replace(/\.docx$/i, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    sources.push({
      title: title || "知识库召回",
      excerpt: excerpt.replace(/\s+/g, " ").slice(0, 220),
      sourceFile: sourceFile || title || "coze-knowledge",
    });
  }

  for (const slice of knowledgeSlices) {
    const [maybeTitle, ...rest] = slice.split("::");
    const body = rest.length ? rest.join("::") : slice;
    const excerpt = body.replace(/\s+/g, " ").slice(0, 220);
    if (!excerpt) continue;
    const title =
      (maybeTitle && maybeTitle !== "知识库" ? maybeTitle : "") ||
      titleFromSlice(body) ||
      "知识库召回";
    push(title.replace(/\.docx$/i, ""), excerpt, maybeTitle);
  }

  // 答案里写明的《政策名》也挂上来源（常与召回切片不是同一份）
  for (const m of answer.matchAll(/《([^》]{4,80})》/g)) {
    push(m[1], excerptNearTitle(answer, m[1]) || answer.slice(0, 200));
  }

  return sources.slice(0, 5);
}

function excerptNearTitle(answer: string, title: string) {
  const i = answer.indexOf(`《${title}》`);
  if (i < 0) return "";
  return answer.slice(i, i + 220);
}

export function isCozeBotConfigured() {
  return Boolean(cozeApiToken() && policyBotId());
}
