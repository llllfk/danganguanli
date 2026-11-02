/**
 * 智能分类：把材料题名 + 分类规则交给扣子智能体，返回类目代码；
 * 失败/非法结果由调用方回退关键词表。
 */
import {
  classifyBotIdEnv,
  cozeApiBase,
  cozeApiToken,
  policyBotId,
  visionBotId,
} from "@/lib/coze-env";
import type { ArchiveCategoryCode } from "@/types";

const VALID_CODES = new Set<string>([
  "0100",
  "0200",
  "0300",
  "0401",
  "0402",
  "0403",
  "0404",
  "0500",
  "0600",
  "0700",
  "0800",
  "0901",
  "0902",
  "0903",
  "0904",
  "1000",
]);

/** 分类专用 Bot；未配则复用视觉 / 政策问答 Bot */
export function classifyBotId() {
  return classifyBotIdEnv() || visionBotId() || policyBotId();
}

export function isClassifyAgentConfigured() {
  return Boolean(cozeApiToken() && classifyBotId());
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCategoryCode(raw: string): ArchiveCategoryCode | null {
  const s = String(raw || "")
    .trim()
    .replace(/类/g, "")
    .replace(/^第/, "");
  // 直接四位代码
  if (VALID_CODES.has(s)) return s as ArchiveCategoryCode;
  // 4-1 / 9-2
  const m = s.match(/^([1-9]|10)\s*[-−–]?\s*([1-4])?$/);
  if (m) {
    const major = m[1];
    const minor = m[2];
    const map: Record<string, string> = {
      "1": "0100",
      "2": "0200",
      "3": "0300",
      "5": "0500",
      "6": "0600",
      "7": "0700",
      "8": "0800",
      "10": "1000",
      "4-1": "0401",
      "4-2": "0402",
      "4-3": "0403",
      "4-4": "0404",
      "9-1": "0901",
      "9-2": "0902",
      "9-3": "0903",
      "9-4": "0904",
    };
    const key = minor ? `${major}-${minor}` : major;
    const code = map[key];
    if (code && VALID_CODES.has(code)) return code as ArchiveCategoryCode;
  }
  // 从文本里抠 0401 这类
  const embedded = s.match(/\b(0[1-9]0[0-4]|1000)\b/);
  if (embedded && VALID_CODES.has(embedded[1])) {
    return embedded[1] as ArchiveCategoryCode;
  }
  return null;
}

function parseCategoryFromAnswer(text: string): ArchiveCategoryCode | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const cand = String(
        obj.categoryCode ||
          obj.category ||
          obj.code ||
          obj.suggestedCategory ||
          obj.class ||
          ""
      );
      const n = normalizeCategoryCode(cand);
      if (n) return n;
    } catch {
      /* fall through */
    }
  }
  return normalizeCategoryCode(raw);
}

export type ClassifyAgentInput = {
  materialName: string;
  /** 业务规则文案（修正规则/附件4） */
  ruleText?: string;
  /** 关键词表摘要，帮助模型对齐现有类目 */
  keywordHint?: string;
};

/**
 * 调用扣子文本对话，按规则返回档案类目代码；失败返回 null。
 */
export async function classifyByAgent(
  input: ClassifyAgentInput
): Promise<ArchiveCategoryCode | null> {
  const name = (input.materialName || "").trim();
  if (!name) return null;
  const token = cozeApiToken();
  const botId = classifyBotId();
  if (!token || !botId) return null;

  const ruleBlock = (input.ruleText || "").trim().slice(0, 5000);
  const kwBlock = (input.keywordHint || "").trim().slice(0, 2500);

  const prompt = `你是干部人事档案分类助手。根据材料题名，判断应归入哪一类。

【材料题名】
${name}

【合法类目代码】只能从下列代码中选一个：
0100 第一类履历
0200 第二类自传思想
0300 第三类考核鉴定
0401 第四类-学历学位
0402 第四类-专业技术职务
0403 第四类-学术评鉴
0404 第四类-教育培训
0500 第五类政审审计审核
0600 第六类党团
0700 第七类表彰奖励
0800 第八类处分处理
0901 第九类-工资
0902 第九类-任免
0903 第九类-出国境
0904 第九类-会议代表
1000 第十类其他

${ruleBlock ? `【分类规则】\n${ruleBlock}\n` : ""}
${kwBlock ? `【关键词参考】\n${kwBlock}\n` : ""}
要求：
1. 只输出一行 JSON，不要 Markdown，不要其它说明
2. 格式：{"categoryCode":"0600","reason":"不超过20字"}
3. categoryCode 必须是上面列表中的四位代码；无法判断时用 "1000"`;

  const API = cozeApiBase();
  const started = await fetch(`${API}/v3/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: "archive-classify",
      stream: false,
      auto_save_history: true,
      additional_messages: [
        { role: "user", content: prompt, content_type: "text" },
      ],
    }),
  });
  const sj = (await started.json()) as {
    code: number;
    msg?: string;
    data?: { id: string; conversation_id: string; status: string };
  };
  if (sj.code !== 0 || !sj.data) {
    throw new Error(`分类智能体调用失败: ${sj.msg || sj.code}`);
  }

  let status = sj.data.status;
  const convId = sj.data.conversation_id;
  const chatId = sj.data.id;
  for (let i = 0; i < 40; i++) {
    if (["completed", "failed", "canceled"].includes(status)) break;
    await sleep(1200);
    const detail = await fetch(
      `${API}/v3/chat/retrieve?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const dj = (await detail.json()) as {
      data?: { status: string; last_error?: { msg?: string; code?: number } };
    };
    status = dj.data?.status || status;
    if (status === "failed") {
      throw new Error(
        `分类智能体失败: ${dj.data?.last_error?.msg || status}`
      );
    }
  }
  if (status !== "completed") {
    throw new Error(`分类智能体未完成: ${status}`);
  }

  const msgRes = await fetch(
    `${API}/v3/chat/message/list?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const mj = (await msgRes.json()) as {
    data?: Array<{ role: string; type: string; content: string }>;
  };
  const answer = (mj.data || [])
    .filter((m) => m.role === "assistant" && m.type === "answer" && m.content)
    .map((m) => m.content.trim())
    .join("\n");

  return parseCategoryFromAnswer(answer);
}

/** 把关键词表压成短提示，控制 token */
export function formatKeywordHint(
  rows: Array<{ code: string; keyword: string }>
): string {
  const byCode = new Map<string, string[]>();
  for (const r of rows) {
    const list = byCode.get(r.code) || [];
    if (list.length < 8) list.push(r.keyword);
    byCode.set(r.code, list);
  }
  return [...byCode.entries()]
    .map(([code, kws]) => `${code}: ${kws.join("、")}`)
    .join("\n");
}
