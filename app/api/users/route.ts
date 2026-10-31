import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isValidCnMobile, normalizePhone } from "@/lib/phone";
import { createUser, listUsers } from "@/lib/repos/users";
import type { UserRole } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const users = await listUsers();
    return NextResponse.json({ data: users });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "读取失败";
    const status = msg.includes("未登录")
      ? 401
      : msg.includes("管理员")
        ? 403
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      phone?: string;
      username?: string;
      displayName?: string;
      password?: string;
      role?: UserRole;
    };
    const rawPhone = (body.phone || body.username || "").trim();
    const displayName = (body.displayName || "").trim();
    const password = body.password || "";
    const role = body.role === "admin" ? "admin" : "user";
    if (!rawPhone || !displayName || !password) {
      return NextResponse.json(
        { error: "手机号、显示名、密码均不能为空" },
        { status: 400 }
      );
    }
    if (!isValidCnMobile(rawPhone)) {
      return NextResponse.json(
        { error: "手机号格式不正确（需为11位中国大陆手机号）" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }
    const user = await createUser({
      phone: normalizePhone(rawPhone),
      displayName,
      password,
      role,
    });
    return NextResponse.json({ data: user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "创建失败";
    const status =
      msg.includes("未登录") ? 401 : msg.includes("管理员") ? 403 : 400;
    return NextResponse.json(
      {
        error: /duplicate|unique/i.test(msg) ? "该手机号已注册" : msg,
      },
      { status }
    );
  }
}
