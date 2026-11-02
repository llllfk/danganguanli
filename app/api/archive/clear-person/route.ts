import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { clearPersonData } from "@/lib/repos/clear-person";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/** 清空当前人员全部业务数据（测试用；保留 persons 主档） */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      personCode?: string;
    };
    const personCode = String(body.personCode || "").trim();
    if (!personCode) {
      return NextResponse.json({ error: "缺少人员代码" }, { status: 400 });
    }

    const p = await query<{ person_name: string }>(
      `SELECT person_name FROM persons WHERE person_code = $1`,
      [personCode]
    );
    const personName = p.rows[0]?.person_name || personCode;

    const result = await clearPersonData(personCode);
    const total = Object.values(result.deleted).reduce((s, n) => s + n, 0);

    return NextResponse.json({
      data: {
        ...result,
        personName,
        total,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "清空失败" },
      { status: 500 }
    );
  }
}
