import { NextRequest, NextResponse } from "next/server";
import { listAuditRecords } from "@/lib/store";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q") || undefined;
  const records = await listAuditRecords(keyword);
  const issueTotal = records.reduce((s, r) => s + r.issueCount, 0);
  return NextResponse.json({
    data: {
      records,
      stats: {
        todayCount: records.length,
        issueTotal,
        personCount: new Set(records.map((r) => r.personCode)).size,
      },
    },
  });
}
