import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findUserById, seedDefaultUsers, toAuthUser } from "@/lib/repos/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await seedDefaultUsers();
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const row = await findUserById(session.id);
    if (!row || row.status !== "active") {
      return NextResponse.json({ error: "用户不可用" }, { status: 401 });
    }
    return NextResponse.json({ data: { user: toAuthUser(row) } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取失败" },
      { status: 500 }
    );
  }
}
