import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isValidCnMobile } from "@/lib/phone";
import { deleteUser, updateUser } from "@/lib/repos/users";
import type { UserRole } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      phone?: string;
      displayName?: string;
      role?: UserRole;
      status?: "active" | "disabled";
      password?: string;
    };

    if (body.password && body.password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }
    if (body.phone != null && body.phone !== "" && !isValidCnMobile(body.phone)) {
      return NextResponse.json(
        { error: "手机号格式不正确（需为11位中国大陆手机号）" },
        { status: 400 }
      );
    }

    // 禁止管理员禁用/降权自己
    if (id === admin.id) {
      if (body.status === "disabled") {
        return NextResponse.json(
          { error: "不能禁用当前登录账号" },
          { status: 400 }
        );
      }
      if (body.role && body.role !== "admin") {
        return NextResponse.json(
          { error: "不能取消自己的管理员角色" },
          { status: 400 }
        );
      }
    }

    const user = await updateUser(id, {
      phone: body.phone || undefined,
      displayName: body.displayName,
      role: body.role,
      status: body.status,
      password: body.password || undefined,
    });
    return NextResponse.json({ data: user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失败";
    const status =
      msg.includes("未登录") ? 401 : msg.includes("管理员") ? 403 : 400;
    return NextResponse.json(
      { error: /duplicate|unique/i.test(msg) ? "该手机号已注册" : msg },
      { status }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    if (id === admin.id) {
      return NextResponse.json(
        { error: "不能删除当前登录账号" },
        { status: 400 }
      );
    }
    await deleteUser(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "删除失败";
    const status =
      msg.includes("未登录") ? 401 : msg.includes("管理员") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
