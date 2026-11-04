import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { clearPersonData, listDeletablePersons } from "@/lib/repos/clear-person";

export const runtime = "nodejs";

/** List every person, including master records without uploaded archives. */
export async function GET() {
  try {
    if (!(await getSessionUser())) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ data: await listDeletablePersons() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载人员失败" }, { status: 500 });
  }
}

/** Delete the explicitly selected person's master record, related records and uploaded copies. */
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

    const result = await clearPersonData(personCode);
    const total = Object.values(result.deleted).reduce((s, n) => s + n, 0);

    return NextResponse.json({
      data: {
        ...result,
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
