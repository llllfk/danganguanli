import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  verifySessionTokenEdge,
} from "@/lib/auth-edge";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|css|js|map|woff2?)$/)
  ) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) {
    // 已登录访问登录页 → 进系统
    if (pathname === "/login") {
      const raw = request.cookies.get(SESSION_COOKIE)?.value;
      if (raw) {
        const session = await verifySessionTokenEdge(raw);
        if (session) {
          return NextResponse.redirect(new URL("/policy", request.url));
        }
      }
    }
    return NextResponse.next();
  }

  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = raw ? await verifySessionTokenEdge(raw) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/users") || pathname.startsWith("/api/users")) {
    if (session.role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/policy", request.url));
    }
  }

  const res = NextResponse.next();
  res.headers.set("x-user-role", session.role);
  res.headers.set("x-user-name", encodeURIComponent(session.displayName));
  return res;
}

export const config = {
  // 上传接口跳过中间件，避免大体积 multipart 被截断导致 FormData 解析失败
  matcher: ["/((?!_next/static|_next/image|api/archive/upload).*)"],
};
