/**
 * 扣子视觉：上传 JPG → 多模态对话 → 抽取材料题名 / 形成日期（末日期）
 * 扣子自定义环境变量请配 VISION_BOT_ID（不能用 COZE_ 前缀）
 */

import {
  cozeApiBase,
  cozeApiToken,
  isVisionConfigured,
  visionBotId,
} from "@/lib/coze-env";
import {
  ARCHIVE_META_PROMPT,
  parseArchiveMetaJson,
  type VisionExtractResult,
} from "@/lib/vision-meta";

export type { VisionExtractResult };
export { visionBotId };

const API = cozeApiBase();

function token() {
  const t = cozeApiToken();
  if (!t) throw new Error("未配置 API_TOKEN（或本地 COZE_API_TOKEN）");
  return t;
}

export function isCozeVisionConfigured() {
  return isVisionConfigured();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 上传本地字节到扣子，返回 file_id */
export async function uploadCozeFile(
  bytes: Buffer,
  fileName = "page.jpg",
  options?: { signal?: AbortSignal }
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
    signal: options?.signal,
  });
  const json = (await res.json().catch(() => {
    throw new Error(`扣子文件上传服务返回异常（HTTP ${res.status}），请稍后重试`);
  })) as {
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

type ImageInput = { bytes: Buffer; fileName?: string };

/** 对多张 JPG 调用视觉 Bot，抽取材料元数据（题名 + 末日期） */
export async function extractMetaFromImages(
  images: ImageInput[]
): Promise<VisionExtractResult> {
  const botId = visionBotId();
  if (!botId) {
    throw new Error(
      "未配置 VISION_BOT_ID：请在扣子创建「视觉理解」智能体并发布为 API（自定义变量勿用 COZE_ 前缀）"
    );
  }
  if (!images.length) return {};

  const parts: Array<
    { type: "text"; text: string } | { type: "image"; file_id: string }
  > = [{ type: "text", text: ARCHIVE_META_PROMPT }];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const fileId = await uploadCozeFile(
      img.bytes,
      img.fileName || `page-${i + 1}.jpg`
    );
    parts.push({ type: "image", file_id: fileId });
  }

  const content = JSON.stringify(parts);
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
  // 多图上传后再对话，常见 30~70s；轮询过短会误判失败，导致名称/日期写不回
  for (let i = 0; i < 70; i++) {
    if (
      status === "completed" ||
      status === "failed" ||
      status === "canceled"
    ) {
      break;
    }
    await sleep(1500);
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
  const messages =
    (msgRes.data as Array<{
      role: string;
      type: string;
      content: string;
    }>) || [];
  const answer = messages
    .filter((m) => m.role === "assistant" && m.type === "answer" && m.content)
    .map((m) => m.content.trim())
    .join("\n");

  return parseArchiveMetaJson(answer || "");
}

/** 对单张 JPG 调用视觉 Bot，抽取材料元数据 */
export async function extractMetaFromImage(
  bytes: Buffer,
  fileName = "page.jpg"
): Promise<VisionExtractResult> {
  return extractMetaFromImages([{ bytes, fileName }]);
}
