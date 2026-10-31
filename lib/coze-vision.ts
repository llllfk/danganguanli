/**
 * 扣子视觉：上传 JPG → 多模态对话 → 抽取材料名称 / 形成日期
 * 需配置 COZE_VISION_BOT_ID（发布为 API 的视觉理解智能体）
 */

const API = process.env.COZE_API_BASE || "https://api.coze.cn";

function token() {
  const t = process.env.COZE_API_TOKEN || process.env.COZE_PAT;
  if (!t) throw new Error("未配置 COZE_API_TOKEN");
  return t;
}

export function visionBotId() {
  return (
    process.env.COZE_VISION_BOT_ID ||
    process.env.COZE_ARCHIVE_BOT_ID ||
    ""
  );
}

export function isCozeVisionConfigured() {
  return Boolean(
    (process.env.COZE_API_TOKEN || process.env.COZE_PAT) && visionBotId()
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type VisionExtractResult = {
  materialName?: string;
  formDate?: string;
  summary?: string;
  raw?: string;
};

const EXTRACT_PROMPT = `你是干部人事档案材料识别助手。请阅读图片（档案扫描件首页），只提取下列字段，严格输出一行 JSON，不要 Markdown，不要其它说明：
{"materialName":"材料全称","formDate":"YYYY-MM-DD或空字符串","summary":"不超过30字的摘要"}

规则：
- materialName：页面标题/表格名称，如「干部履历表」「毕业生登记表」「干部任免审批表」等，不要流水号
- formDate：落款日期、填表日期或材料形成日期；看不清则 ""
- 禁止编造看不到的内容`;

/** 上传本地字节到扣子，返回 file_id */
export async function uploadCozeFile(
  bytes: Buffer,
  fileName = "page.jpg"
): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
  form.append("file", blob, fileName);

  const res = await fetch(`${API}/v1/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
    },
    body: form,
  });
  const json = (await res.json()) as {
    code: number;
    msg: string;
    data?: { id: string };
  };
  if (json.code !== 0 || !json.data?.id) {
    throw new Error(`上传图片到扣子失败: ${json.msg || res.statusText}`);
  }
  return json.data.id;
}

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

function parseExtractJson(text: string): VisionExtractResult {
  const raw = text.trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { raw };
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const materialName = String(obj.materialName || obj.material_name || "")
      .trim()
      .replace(/\s+/g, "");
    let formDate = String(obj.formDate || obj.form_date || "").trim();
    // 归一化常见日期
    const dm = formDate.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
    if (dm) {
      formDate = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      formDate = "";
    }
    const summary = String(obj.summary || "")
      .trim()
      .slice(0, 80);
    return {
      materialName: materialName || undefined,
      formDate: formDate || undefined,
      summary: summary || undefined,
      raw,
    };
  } catch {
    return { raw };
  }
}

/** 对单张 JPG 调用视觉 Bot，抽取材料元数据 */
export async function extractMetaFromImage(
  bytes: Buffer,
  fileName = "page.jpg"
): Promise<VisionExtractResult> {
  const botId = visionBotId();
  if (!botId) {
    throw new Error(
      "未配置 COZE_VISION_BOT_ID：请在扣子创建「视觉理解」智能体并发布为 API"
    );
  }

  const fileId = await uploadCozeFile(bytes, fileName);
  const content = JSON.stringify([
    { type: "text", text: EXTRACT_PROMPT },
    { type: "image", file_id: fileId },
  ]);

  const started = await cozeFetch("/v3/chat", {
    method: "POST",
    body: JSON.stringify({
      bot_id: botId,
      user_id: "archive-vision",
      stream: false,
      auto_save_history: true,
      additional_messages: [
        {
          role: "user",
          content,
          content_type: "object_string",
        },
      ],
    }),
  });

  const chat = started.data as {
    id: string;
    conversation_id: string;
    status: string;
    last_error?: { code: number; msg: string } | null;
  };

  let status = chat.status;
  for (let i = 0; i < 40; i++) {
    if (
      status === "completed" ||
      status === "failed" ||
      status === "canceled"
    ) {
      break;
    }
    await sleep(1200);
    const detail = await cozeFetch(
      `/v3/chat/retrieve?conversation_id=${encodeURIComponent(chat.conversation_id)}&chat_id=${encodeURIComponent(chat.id)}`
    );
    const d = detail.data as typeof chat;
    status = d.status;
    if (d.last_error?.code) {
      throw new Error(
        `视觉识别失败: ${d.last_error.msg || d.last_error.code}`
      );
    }
  }

  if (status !== "completed") {
    throw new Error(`视觉识别未完成，状态: ${status}`);
  }

  const msgRes = await cozeFetch(
    `/v3/chat/message/list?conversation_id=${encodeURIComponent(chat.conversation_id)}&chat_id=${encodeURIComponent(chat.id)}`
  );
  const messages = (msgRes.data as Array<{
    role: string;
    type: string;
    content: string;
  }>) || [];
  const answer = messages
    .filter((m) => m.role === "assistant" && m.type === "answer" && m.content)
    .map((m) => m.content.trim())
    .join("\n");

  return parseExtractJson(answer || "");
}
