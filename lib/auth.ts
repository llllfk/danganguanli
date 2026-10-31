import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthUser, UserRole } from "@/types";

export const SESSION_COOKIE = "ahr_session";
const SESSION_DAYS = 7;

function secret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.COZE_API_TOKEN ||
    "archive-hr-ai-dev-secret-change-me"
  );
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

type SessionPayload = {
  uid: string;
  /** 手机号 */
  username: string;
  displayName: string;
  role: UserRole;
  exp: number;
};

function b64url(buf: Buffer | string) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64url");
}

function signPayload(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SessionPayload;
    if (!payload?.uid || !payload.exp || payload.exp < Date.now()) return null;
    if (payload.role !== "admin" && payload.role !== "user") return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(user: {
  id: string;
  phone: string;
  displayName: string;
  role: UserRole;
}): string {
  return signPayload({
    uid: user.id,
    username: user.phone,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = verifySessionToken(raw);
  if (!payload) return null;
  return {
    id: payload.uid,
    phone: payload.username,
    displayName: payload.displayName,
    role: payload.role,
  };
}

export async function requireSessionUser(): Promise<AuthUser> {
  const u = await getSessionUser();
  if (!u) throw new Error("未登录");
  return u;
}

export async function requireAdmin(): Promise<AuthUser> {
  const u = await requireSessionUser();
  if (u.role !== "admin") throw new Error("需要管理员权限");
  return u;
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
