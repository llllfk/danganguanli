/**
 * 扣子相关环境变量读取。
 * 注意：扣子编程「自定义环境变量」不能以 COZE_ 开头（平台保留）。
 * 因此优先读非 COZE_ 名；本地 .env.local 仍可继续用 COZE_*。
 */

function first(...keys: string[]) {
  for (const k of keys) {
    const v = (process.env[k] || "").trim();
    if (v) return v;
  }
  return "";
}

/** API Base，默认国内 https://api.coze.cn */
export function cozeApiBase() {
  return first("API_BASE", "OPENAPI_BASE", "COZE_API_BASE") || "https://api.coze.cn";
}

/** 调用扣子 OpenAPI 的个人访问令牌 */
export function cozeApiToken() {
  return first(
    "API_TOKEN",
    "BOT_API_TOKEN",
    "OPENAPI_TOKEN",
    "COZE_API_TOKEN",
    "COZE_PAT"
  );
}

/** 政策问答智能体 */
export function policyBotId() {
  return first("POLICY_BOT_ID", "BOT_ID", "COZE_BOT_ID") || "7700834694778617891";
}

/** 整编/审核视觉理解智能体（须发布为 API） */
export function visionBotId() {
  return first(
    "VISION_BOT_ID",
    "ARCHIVE_VISION_BOT_ID",
    "COZE_VISION_BOT_ID",
    "COZE_ARCHIVE_BOT_ID"
  );
}

/** 智能分类专用 Bot；未配时由 classify-agent 回退到视觉/政策 Bot */
export function classifyBotIdEnv() {
  return first("CLASSIFY_BOT_ID", "ARCHIVE_CLASSIFY_BOT_ID");
}

/** 政策知识库 dataset id */
export function policyDatasetId() {
  return first(
    "POLICY_DATASET_ID",
    "KNOWLEDGE_DATASET_ID",
    "COZE_DATASET_ID",
    "COZE_POLICY_DATASET_ID"
  );
}

export function isVisionConfigured() {
  return Boolean(cozeApiToken() && visionBotId());
}

export function isKnowledgeConfigured() {
  return Boolean(cozeApiToken() && policyDatasetId());
}
