import { NextRequest, NextResponse } from "next/server";
import { runAudit, summarizeAudit } from "@/lib/audit-engine";
import { addAuditRecord } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      personCode?: string;
      personName?: string;
    };
    const personCode = body.personCode || "00001";
    const personName = body.personName || "张三";
    const report = runAudit(personCode, personName);
    const { issueCount, summary } = summarizeAudit(report);
    const record = addAuditRecord({
      personName,
      personCode,
      summary,
      issueCount,
      report,
    });
    return NextResponse.json({ data: { report, record } });
  } catch {
    return NextResponse.json({ error: "核验失败" }, { status: 500 });
  }
}
