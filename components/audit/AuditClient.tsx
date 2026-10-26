"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RuleEditorModal } from "@/components/shared/RuleEditorModal";
import { ARCHIVE_CATEGORIES } from "@/lib/data/categories";
import type { AuditFieldResult, AuditReport } from "@/types";

export function AuditClient() {
  const [loaded, setLoaded] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceField, setSourceField] = useState<AuditFieldResult | null>(null);
  const [opinionField, setOpinionField] = useState<AuditFieldResult | null>(
    null
  );
  const [auditRule, setAuditRule] = useState("");
  const [compRule, setCompRule] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);

  useEffect(() => {
    fetch("/api/audit/rules")
      .then((r) => r.json())
      .then((j) => {
        setAuditRule(j.data?.audit || "");
        setCompRule(j.data?.completeness || "");
      });
  }, []);

  async function onLoadDemo() {
    setLoaded(true);
    setReport(null);
  }

  async function onVerify() {
    setBusy(true);
    try {
      const res = await fetch("/api/audit/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personCode: "00001", personName: "张三" }),
      });
      const json = await res.json();
      setReport(json.data.report);
      setLoaded(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col gap-3">
      <div className="rounded-2xl bg-white shadow-card px-4 py-3 flex flex-wrap gap-2 items-center">
        <Button variant="secondary" size="sm" disabled>
          系统读取
        </Button>
        <Button size="sm" onClick={onLoadDemo}>
          上传整编完成档案（演示）
        </Button>
        <Button size="sm" onClick={onVerify} disabled={busy}>
          {busy ? "检验中..." : "开始检验"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onVerify} disabled={busy}>
          重新核验
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRuleOpen(true)}>
          修正规则
        </Button>
        <Link href="/audit/records">
          <Button size="sm" variant="ghost">
            核验记录
          </Button>
        </Link>
        <Button size="sm" variant="ghost" disabled>
          确认并返回主系统
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-3 flex-1 min-h-0">
        <section className="rounded-2xl bg-white shadow-card p-3 overflow-auto">
          <h3 className="font-bold mb-2">选择数据源</h3>
          {!loaded ? (
            <div className="space-y-2">
              {ARCHIVE_CATEGORIES.map((c) => (
                <div
                  key={c.code}
                  className="rounded-lg bg-[#f7fbff] border border-[#e4ebf3] px-3 py-2 text-sm"
                >
                  {c.name}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="rounded-xl border border-[#ddeafb] p-3 bg-[#eef6fe]">
                人员：张三（00001）· 有序样本已读取
              </div>
              {[
                "0100 履历 · 2件",
                "0401 学历学位 · 6件",
                "0402 职称 · 3件",
                "0500 审核 · 相关材料",
                "0600 党团 · 6件",
                "0700 表彰 · 1件",
                "0901 工资 · 3件",
                "0902 任免 · 相关材料",
                "1000 其他 · 1件",
              ].map((t) => (
                <div
                  key={t}
                  className="rounded-lg border border-[#e4ebf3] px-3 py-2"
                >
                  {t}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white shadow-card p-4 overflow-auto">
          <h3 className="font-bold mb-3">核验报告</h3>
          {!report ? (
            <p className="text-[#7b8da0] text-sm">
              点击「开始检验」生成信息比对报告与材料完整性筛查报告。
            </p>
          ) : (
            <div className="space-y-5 anim-fade-up">
              <div>
                <h4 className="text-[#2f6fc0] font-semibold mb-2">
                  信息比对报告 · {report.personName}（{report.personCode}）
                </h4>
                <div className="space-y-2">
                  {report.fields.map((f) => (
                    <div
                      key={f.field}
                      className="rounded-xl border border-[#e4ebf3] p-3 flex flex-wrap gap-3 items-start justify-between"
                    >
                      <div>
                        <div className="font-semibold">
                          {f.label}：{f.value}
                        </div>
                        <div
                          className={`text-xs mt-1 ${
                            f.status === "ok"
                              ? "text-emerald-600"
                              : f.status === "missing"
                                ? "text-[#7b8da0]"
                                : "text-amber-600"
                          }`}
                        >
                          {f.statusText}
                        </div>
                        <div className="text-xs text-[#7b8da0] mt-1">
                          主来源：
                          {f.sources[0]
                            ? `${f.sources[0].materialName}（${f.sources[0].formYear}）[${f.sources[0].materialNo}]`
                            : "无"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="text-xs text-[#4a9eff]"
                          onClick={() => setSourceField(f)}
                        >
                          查看全部来源
                        </button>
                        {f.status !== "ok" && f.aiOpinion ? (
                          <button
                            className="text-xs text-amber-600"
                            onClick={() => setOpinionField(f)}
                          >
                            查看AI意见
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[#2f6fc0] font-semibold mb-2">
                  材料完整性筛查报告
                </h4>
                {report.completeness.length === 0 ? (
                  <p className="text-sm text-emerald-600">未发现必要材料缺失</p>
                ) : (
                  <ul className="space-y-2">
                    {report.completeness.map((c, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">{c.category}：</span>
                        {c.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {sourceField ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5">
            <div className="flex justify-between mb-3">
              <h4 className="font-bold">{sourceField.label} · 全部来源</h4>
              <button onClick={() => setSourceField(null)}>关闭</button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-auto">
              {sourceField.sources.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[#e4ebf3] px-3 py-2 text-sm"
                >
                  {s.materialName}（{s.formYear}）[{s.materialNo}]：{s.value}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {opinionField ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5">
            <div className="flex justify-between mb-3">
              <h4 className="font-bold">{opinionField.label} · AI意见</h4>
              <button onClick={() => setOpinionField(null)}>关闭</button>
            </div>
            <p className="text-sm leading-7">{opinionField.aiOpinion}</p>
          </div>
        </div>
      ) : null}

      <RuleEditorModal
        open={ruleOpen}
        title="审核查验规则"
        value={`${auditRule}\n\n——完整性——\n${compRule}`}
        onClose={() => setRuleOpen(false)}
        onSave={async (next) => {
          const [a, c] = next.split("——完整性——");
          const res = await fetch("/api/audit/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audit: (a || "").trim(),
              completeness: (c || "").trim(),
            }),
          });
          const j = await res.json();
          setAuditRule(j.data.audit);
          setCompRule(j.data.completeness);
        }}
      />
    </div>
  );
}
