export type AuditProgress = { done: number; total: number; materialNo: string };

function responseError(status: number, body = "") {
  if (status === 401) return new Error("登录已失效，请重新登录后核验");
  if (status === 504 || /upstream|timeout|timed out/i.test(body)) {
    return new Error("核验请求被上游服务中断或超时。已完成的识别会保留，请再次开始检验继续。");
  }
  return new Error(`核验服务返回异常（HTTP ${status}），请稍后重试；已完成的识别会保留。`);
}

/** Read JSON errors and streamed batches without exposing a JSON.parse exception to the user. */
export async function readAuditResponse<T>(
  response: Response,
  onProgress: (progress: AuditProgress) => void
): Promise<T> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const text = await response.text();
    let json: { data?: T; error?: string };
    try { json = JSON.parse(text); } catch { throw responseError(response.status, text); }
    if (!json || typeof json !== "object") throw responseError(response.status, text);
    if (json.error) throw new Error(json.error);
    if (!response.ok || !json.data) throw responseError(response.status);
    return json.data;
  }
  if (!response.body) throw responseError(response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: { type: string; data?: T; error?: string } & Partial<AuditProgress>;
    try { event = JSON.parse(line); } catch { throw responseError(response.status, line); }
    if (!event || typeof event !== "object") throw responseError(response.status, line);
    if (event.type === "error") throw new Error(event.error || "核验失败，请重试");
    if (event.type === "progress" && event.done != null && event.total != null) {
      onProgress({ done: event.done, total: event.total, materialNo: event.materialNo || "" });
    }
    if (event.type === "result") result = event.data;
  };
  try {
    for (;;) {
      let packet: ReadableStreamReadResult<Uint8Array>;
      try { packet = await reader.read(); } catch {
        throw new Error("核验连接已中断，已完成的识别会保留，请再次开始检验继续。");
      }
      const { done, value } = packet;
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) consume(line);
      if (done) break;
    }
    consume(buffer);
    if (!result) throw new Error("核验连接已中断，已完成的识别会保留，请再次开始检验继续。");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
