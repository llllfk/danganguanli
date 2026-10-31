import { NextRequest, NextResponse } from "next/server";
import {
  getTalentPortrait,
  listMatchBoard,
  listMatchScores,
  listReminders,
  listTalentCharts,
  listTalentStats,
  listTitlePromo,
  updateReminderDate,
} from "@/lib/repos/talent";

export async function GET(request: NextRequest) {
  try {
    const section = request.nextUrl.searchParams.get("section") || "all";
    const personCode =
      request.nextUrl.searchParams.get("personCode") || "00001";

    if (section === "stats") {
      return NextResponse.json({
        data: {
          summary: await listTalentStats(),
          charts: await listTalentCharts(),
        },
      });
    }
    if (section === "portrait") {
      return NextResponse.json({
        data: await getTalentPortrait(personCode),
      });
    }
    if (section === "match") {
      return NextResponse.json({
        data: await listMatchBoard(personCode),
      });
    }
    if (section === "matchScores") {
      return NextResponse.json({
        data: await listMatchScores(personCode),
      });
    }
    if (section === "reminders") {
      const [reminders, titlePromo] = await Promise.all([
        listReminders(),
        listTitlePromo(),
      ]);
      return NextResponse.json({ data: { reminders, titlePromo } });
    }

    const [stats, charts, portrait, match, reminders, titlePromo] =
      await Promise.all([
        listTalentStats(),
        listTalentCharts(),
        getTalentPortrait(personCode),
        listMatchBoard(personCode),
        listReminders(),
        listTitlePromo(),
      ]);
    return NextResponse.json({
      data: {
        stats,
        charts,
        portrait,
        match,
        reminders,
        titlePromo,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取人才数据失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; date?: string };
    if (!body.id || !body.date) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    const data = await updateReminderDate(body.id, body.date);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失败" },
      { status: 500 }
    );
  }
}
