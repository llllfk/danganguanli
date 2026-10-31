import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  requireSessionUser,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { isValidCnMobile } from "@/lib/phone";
import {
  findUserById,
  toAuthUser,
  updateUser,
} from "@/lib/repos/users";

export const dynamic = "force-dynamic";

/** 当前用户修改个人信息 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSessionUser();
    const body = (await request.json()) as {
      displayName?: string;
      phone?: string;
      password?: string;
      currentPassword?: string;
    };

    const row = await findUserById(session.id);
    if (!row || row.status !== "active") {
      return NextResponse.json({ error: "用户不可用" }, { status: 401 });
    }

    const displayName = (body.displayName || "").trim();
    if (!displayName) {
      return NextResponse.json({ error: "请填写姓名/显示名" }, { status: 400 });
    }

    if (body.phone != null && body.phone !== "" && !isValidCnMobile(body.phone)) {
      return NextResponse.json(
        { error: "手机号格式不正确（需为11位中国大陆手机号）" },
        { status: 400 }
      );
    }

    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
      }
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "修改密码请填写当前密码" },
          { status: 400 }
        );
      }
      if (!verifyPassword(body.currentPassword, row.password_hash)) {
        return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
      }
    }

    const user = await updateUser(session.id, {
      displayName,
      phone: body.phone || undefined,
      password: body.password || undefined,
    });
    const fresh = await findUserById(user.id);
    if (!fresh) {
      return NextResponse.json({ error: "用户不存在" }, { status: 400 });
    }

    const authUser = toAuthUser(fresh);
    const token = createSessionToken({
      id: authUser.id,
      phone: authUser.phone,
      displayName: authUser.displayName,
      role: authUser.role,
    });
    const res = NextResponse.json({ data: { user: authUser } });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    const status = msg.includes("未登录") ? 401 : 400;
    return NextResponse.json(
      { error: /duplicate|unique/i.test(msg) ? "该手机号已注册" : msg },
      { status }
    );
  }
}
