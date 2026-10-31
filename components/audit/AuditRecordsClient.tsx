"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AuditRecord } from "@/types";

const PAGE_SIZE = 10;

function infoIssueText(r: AuditRecord) {
  const issues =
    r.report?.fields.filter((f) => f.status !== "ok") || [];
  if (!issues.length) return "";
  return issues[0].statusText || "信息比对异常";
}

function completenessIssueText(r: AuditRecord) {
  const n = r.report?.completeness?.length || 0;
  if (!n) return "";
  return `缺少 ${n} 项材料`;
}

export function AuditRecordsClient() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [typeInfo, setTypeInfo] = useState(true);
  const [typeMiss, setTypeMiss] = useState(false);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [stats, setStats] = useState({ todayCount: 0, personCount: 0 });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(keyword?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/audit/records?q=${encodeURIComponent(keyword || "")}`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRecords(json.data.records || []);
      setStats({
        todayCount: json.data.stats?.personCount ?? json.data.stats?.todayCount ?? 0,
        personCount: json.data.stats?.personCount ?? 0,
      });
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function onQuery() {
    const kw = name.trim() || code.trim();
    load(kw);
  }

  function onReset() {
    setName("");
    setCode("");
    setTypeInfo(true);
    setTypeMiss(false);
    load("");
  }

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (name.trim() && !r.personName.includes(name.trim())) return false;
      if (code.trim() && !r.personCode.includes(code.trim())) return false;
      const hasInfo = (r.report?.fields || []).some((f) => f.status !== "ok");
      const hasMiss = (r.report?.completeness || []).length > 0;
      if (!typeInfo && !typeMiss) return true;
      if (typeInfo && typeMiss) return hasInfo || hasMiss;
      if (typeInfo) return hasInfo;
      if (typeMiss) return hasMiss;
      return true;
    });
  }, [records, name, code, typeInfo, typeMiss]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE
  );

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col gap-2 min-h-0">
      {error ? (
        <div className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(240px,0.7fr)_minmax(640px,2fr)] gap-3 flex-1 min-h-0">
        {/* 左：筛选条件 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-[#e4ebf3]">
            <span className="text-[#4a9eff] text-lg" aria-hidden>
              ▽
            </span>
            <h3 className="text-lg font-semibold text-[#243b53]">筛选条件</h3>
          </header>

          <div className="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#334155]">姓名</span>
              <input
                className="w-full h-10 rounded-lg border border-[#d4dce6] px-3 text-sm outline-none focus:border-[#4a9eff] focus:ring-2 focus:ring-[#4a9eff]/20"
                placeholder="请输入姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onQuery()}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#334155]">员工代码</span>
              <input
                className="w-full h-10 rounded-lg border border-[#d4dce6] px-3 text-sm outline-none focus:border-[#4a9eff] focus:ring-2 focus:ring-[#4a9eff]/20"
                placeholder="请输入员工代码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onQuery()}
              />
            </label>

            <div className="space-y-2">
              <div className="text-sm font-medium text-[#334155]">问题类型</div>
              <label className="flex items-center gap-2 text-sm text-[#334155] cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#4a9eff]"
                  checked={typeInfo}
                  onChange={(e) => setTypeInfo(e.target.checked)}
                />
                信息比对异常
              </label>
              <label className="flex items-center gap-2 text-sm text-[#334155] cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#4a9eff]"
                  checked={typeMiss}
                  onChange={(e) => setTypeMiss(e.target.checked)}
                />
                材料缺失
              </label>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={onQuery}
                className="flex-1 h-10 rounded-[8px] bg-[#4a9eff] text-white text-sm font-semibold hover:bg-[#3b8fe8] disabled:opacity-50"
              >
                {busy ? "查询中..." : "查询"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onReset}
                className="flex-1 h-10 rounded-[8px] border border-[#c5d3e3] bg-white text-[#334155] text-sm font-medium hover:bg-[#f5f8fb] disabled:opacity-50"
              >
                重置
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-[#e4ebf3] text-sm text-[#5b6b7c]">
            今日审核{" "}
            <span className="font-semibold text-[#1a4b7a]">
              {stats.personCount || stats.todayCount}
            </span>{" "}
            人
          </div>
        </section>

        {/* 右：核验记录表 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e4ebf3]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#4a9eff] text-lg">▣</span>
              <h3 className="text-lg font-semibold text-[#243b53]">核验记录</h3>
            </div>
            <div className="inline-flex rounded-lg border border-[#c5daf5] overflow-hidden shrink-0">
              <Link
                href="/audit"
                className="px-3 py-1.5 text-sm font-medium text-[#2f6fc0] bg-white hover:bg-[#eef6fe]"
              >
                核验报告
              </Link>
              <span className="px-3 py-1.5 text-sm font-medium bg-[#4a9eff] text-white">
                核验记录
              </span>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#e0edfb] text-[#1e3a5f]">
                  <th className="px-3 py-3 font-semibold w-14 text-center">序号</th>
                  <th className="px-3 py-3 font-semibold text-left w-24">姓名</th>
                  <th className="px-3 py-3 font-semibold text-left w-28">员工代码</th>
                  <th className="px-3 py-3 font-semibold text-left">信息比对问题</th>
                  <th className="px-3 py-3 font-semibold text-left">
                    材料完整性筛查问题
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-[#7b8da0]"
                    >
                      {busy ? "加载中..." : "暂无核验记录"}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r, idx) => {
                    const info = infoIssueText(r);
                    const miss = completenessIssueText(r);
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-[#eef2f7] hover:bg-[#f7fbff]"
                      >
                        <td className="px-3 py-3 text-center text-[#5b6b7c]">
                          {(pageSafe - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-3 py-3 font-medium text-[#1f2937]">
                          {r.personName}
                        </td>
                        <td className="px-3 py-3 text-[#334155]">{r.personCode}</td>
                        <td className="px-3 py-3">
                          {info ? (
                            <span className="inline-flex items-center gap-1 text-rose-600">
                              <span aria-hidden>⚠</span>
                              {info}
                            </span>
                          ) : (
                            <span className="text-[#9aa8b8]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {miss ? (
                            <span className="inline-flex items-center gap-1 text-rose-600">
                              <span aria-hidden>⚠</span>
                              {miss}
                            </span>
                          ) : (
                            <span className="text-[#9aa8b8]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#e4ebf3] text-sm text-[#5b6b7c]">
            <span>共 {filtered.length} 条记录</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 w-8 rounded border border-[#d4dce6] disabled:opacity-40 hover:bg-[#f5f8fb]"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 7)
                .map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`h-8 min-w-8 px-2 rounded border text-sm ${
                      n === pageSafe
                        ? "border-[#4a9eff] bg-[#4a9eff] text-white"
                        : "border-[#d4dce6] hover:bg-[#f5f8fb]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              <button
                type="button"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 w-8 rounded border border-[#d4dce6] disabled:opacity-40 hover:bg-[#f5f8fb]"
              >
                ›
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
