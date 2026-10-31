/**
 * 火山方舟 · 豆包视觉（不经过扣子 Bot）
 * POST {ARK_BASE}/api/v3/chat/completions
 *
 * 环境变量：
 *   ARK_API_KEY / VOLC_ARK_API_KEY
 *   ARK_VISION_MODEL  （接入点 ID 或模型名，如 ep-xxxx / doubao-1.5-vision-pro）
 *   ARK_API_BASE      （默认 https://ark.cn-beijing.volces.com）
 */

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

/** 直接调用方舟豆包视觉，图片用 base64 data URL */
export async function extractMetaFromImageDoubao(
  bytes: Buffer,
  _fileName = "page.jpg"
): Promise<VisionExtractResult> {
  const key = arkKey();
  const model = arkModel();
  if (!key || !model) {
    throw new Error(
      "未配置 ARK_API_KEY / ARK_VISION_MODEL（火山方舟豆包视觉接入点）"
    );
  }

  const b64 = bytes.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  const res = await fetch(`${arkBase()}/api/v3/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACT_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 512,
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
  const content = json.choices?.[0]?.message?.content || "";
  return parseExtractJson(content);
}
