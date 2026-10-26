/**
 * AI 调用封装。
 * Coze 环境可通过平台内置模型；本地无密钥时走规则引擎兜底，保证可演示。
 */
export async function chatCompletion(prompt: string): Promise<string> {
  const endpoint = process.env.COZE_LLM_ENDPOINT || process.env.OLLAMA_HOST;
  const model = process.env.COZE_LLM_MODEL || "qwen3.5";

  if (!endpoint) {
    return "";
  }

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { response?: string };
    return data.response?.trim() || "";
  } catch {
    return "";
  }
}
