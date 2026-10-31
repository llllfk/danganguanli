/**
 * Edge Runtime 可用的会话校验（middleware）
 * 与 lib/auth.ts 使用同一 HMAC 规则
 */

export const SESSION_COOKIE = "ahr_session";

export type EdgeSession = {
  uid: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
  exp: number;
};

function secret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.COZE_API_TOKEN ||
    "archive-hr-ai-dev-secret-change-me"
  );
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function verifySessionTokenEdge(
  token: string
): Promise<EdgeSession | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body)
    );
    const expect = bytesToB64url(signed);
    if (expect !== sig) return null;
    const json = new TextDecoder().decode(b64urlToBytes(body));
    const payload = JSON.parse(json) as EdgeSession;
    if (!payload?.uid || !payload.exp || payload.exp < Date.now()) return null;
    if (payload.role !== "admin" && payload.role !== "user") return null;
    return payload;
  } catch {
    return null;
  }
}
