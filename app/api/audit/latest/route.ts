import { NextRequest, NextResponse } from "next/server";
import { countPageTexts } from "@/lib/repos/page-texts";
import { countAuditSources } from "@/lib/repos/audit-upload";
import { getLatestAuditRecord } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const personCode =
      request.nextUrl.searchParams.get("personCode") || "";
    if (!personCode) {
      return NextResponse.json(
        { error: "缺少 personCode" },
        { status: 400 }
      );
    }
    const [record, sourceCount, textCount] = await Promise.all([
      getLatestAuditRecord(personCode),
      countAuditSources(personCode),
      countPageTexts(personCode),
    ]);
    return NextResponse.json({
      data: {
        record,
        report: record?.report || null,
        sourceCount,
        textCount,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取最近核验失败" },
      { status: 500 }
    );
  }
}
