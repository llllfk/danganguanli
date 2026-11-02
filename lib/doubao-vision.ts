/**
 * 火山方舟 · 豆包视觉（不经过扣子 Bot）
 * POST {ARK_BASE}/api/v3/chat/completions
 *
 * 环境变量：
 *   ARK_API_KEY / VOLC_ARK_API_KEY
 *   ARK_VISION_MODEL  （接入点 ID 或模型名，如 ep-xxxx / doubao-1.5-vision-pro）
 *   ARK_API_BASE      （默认 https://ark.cn-beijing.volces.com）
 */

import {
  ARCHIVE_META_PROMPT,
  parseArchiveMetaJson,
  type VisionExtractResult,
} from "@/lib/vision-meta";

export type { VisionExtractResult };

function arkKey() {
  return (
    process.env.ARK_API_KEY ||
    process.env.VOLC_ARK_API_KEY ||
    process.env.DOUBAO_API_KEY ||
    ""
  );
}

function arkModel() {
  return (
    process.env.ARK_VISION_MODEL ||
    process.env.DOUBAO_VISION_MODEL ||
    process.env.ARK_MODEL ||
    ""
  );
}

function arkBase() {
  return (
    process.env.ARK_API_BASE ||
    process.env.VOLC_ARK_BASE ||
    "https://ark.cn-beijing.volces.com"
  ).replace(/\/$/, "");
}

export function isDoubaoVisionConfigured() {
  return Boolean(arkKey() && arkModel());
}

type ImageInput = { bytes: Buffer; fileName?: string };

/** 直接调用方舟豆包视觉，支持多图 */
export async function extractMetaFromImagesDoubao(
  images: ImageInput[]
): Promise<VisionExtractResult> {
  const key = arkKey();
  const model = arkModel();
  if (!key || !model) {
    throw new Error(
      "未配置 ARK_API_KEY / ARK_VISION_MODEL（火山方舟豆包视觉接入点）"
    );
  }
  if (!images.length) return {};

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: ARCHIVE_META_PROMPT }];

  for (const img of images) {
    const b64 = img.bytes.toString("base64");
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    });
  }

  const res = await fetch(`${arkBase()}/api/v3/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.1,
      max_tokens: 768,
    }),
  });

  const json = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok || json.error) {
    throw new Error(
      `豆包视觉调用失败: ${json.error?.message || res.statusText}`
    );
  }
  const answer = json.choices?.[0]?.message?.content || "";
  return parseArchiveMetaJson(answer);
}

export async function extractMetaFromImageDoubao(
  bytes: Buffer,
  fileName = "page.jpg"
): Promise<VisionExtractResult> {
  return extractMetaFromImagesDoubao([{ bytes, fileName }]);
}
