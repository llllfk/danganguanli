import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import {
  findUserByPhone,
  seedDefaultUsers,
  toAuthUser,
} from "@/lib/repos/users";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await seedDefaultUsers();
    const body = (await request.json()) as {
      phone?: string;
      username?: string;
      password?: string;
    };
    const account = (body.username || body.phone || "").trim();
    const password = body.password || "";
    if (!account || !password) {
      return NextResponse.json(
        { error: "请输入账号和密码" },
        { status: 400 }
      );
    }

    const row = await findUserByPhone(account);
    if (!row || row.status !== "active") {
      return NextResponse.json(
        { error: "账号或密码错误" },
        { status: 401 }
      );
    }
    if (!verifyPassword(password, row.password_hash)) {
      return NextResponse.json(
        { error: "账号或密码错误" },
        { status: 401 }
      );
    }

    const user = toAuthUser(row);
    const token = createSessionToken(user);
    const res = NextResponse.json({ data: { user } });
    const opt = sessionCookieOptions(token);
    res.cookies.set(opt.name, opt.value, {
      httpOnly: opt.httpOnly,
      sameSite: opt.sameSite,
      secure: opt.secure,
      path: opt.path,
      maxAge: opt.maxAge,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登录失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
