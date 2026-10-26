"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AuditRecord } from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function AuditRecordsPage() {
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [stats, setStats] = useState({
    todayCount: 0,
    issueTotal: 0,
    personCount: 0,
  });
  const [active, setActive] = useState<AuditRecord | null>(null);

  async function load(keyword?: string) {
    const res = await fetch(
      `/api/audit/records?q=${encodeURIComponent(keyword || "")}`
    );
    const json = await res.json();
    setRecords(json.data.records || []);
    setStats(json.data.stats || { todayCount: 0, issueTotal: 0, personCount: 0 });
    setActive((json.data.records || [])[0] || null);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col gap-3">
      <div className="rounded-2xl bg-white shadow-card px-4 py-3 flex flex-wrap gap-3 items-center">
        <Link href="/audit">
          <Button size="sm" variant="secondary">
            返回检验报告
          </Button>
        </Link>
        <input
          className="rounded-lg border border-[#cfe0f5] px-3 py-1.5 text-sm"
          placeholder="姓名或员工代码（空=全部）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button size="sm" onClick={() => load(q)}>
          筛选
        </Button>
        <div className="ml-auto flex gap-4 text-sm">
          <span>
            今日审核：<b>{stats.todayCount}</b>
          </span>
          <span>
            涉及人员：<b>{stats.personCount}</b>
          </span>
          <span>
            问题合计：<b>{stats.issueTotal}</b>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-3 flex-1 min-h-0">
        <section className="rounded-2xl bg-white shadow-card p-4 overflow-auto">
          <h3 className="font-bold mb-3">当日核验记录</h3>
          {records.length === 0 ? (
            <p className="text-sm text-[#7b8da0]">今日暂无记录</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#f5f9fd] text-[#1a4b7a]">
                <tr>
                  <th className="text-left p-2">时间</th>
                  <th className="text-left p-2">姓名</th>
                  <th className="text-left p-2">代码</th>
                  <th className="text-left p-2">摘要</th>
                  <th className="text-left p-2">问题数</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-[#eef2f7] cursor-pointer hover:bg-[#eef6fe] ${
                      active?.id === r.id ? "bg-[#eef6fe]" : ""
                    }`}
                    onClick={() => setActive(r)}
                  >
                    <td className="p-2">{formatDateTime(r.createdAt)}</td>
                    <td className="p-2">{r.personName}</td>
                    <td className="p-2">{r.personCode}</td>
                    <td className="p-2">{r.summary}</td>
                    <td className="p-2">{r.issueCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-2xl bg-white shadow-card p-4 overflow-auto">
          <h3 className="font-bold mb-3">问题汇总</h3>
          {!active?.report ? (
            <p className="text-sm text-[#7b8da0]">选择左侧记录查看汇总</p>
          ) : (
            <div className="space-y-3 text-sm anim-fade-up">
              {active.report.fields
                .filter((f) => f.status !== "ok")
                .map((f) => (
                  <div
                    key={f.field}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                  >
                    <div className="font-semibold">{f.label}</div>
                    <div>{f.statusText}</div>
                  </div>
                ))}
              {active.report.completeness.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#e4ebf3] px-3 py-2"
                >
                  {c.category}：{c.message}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
