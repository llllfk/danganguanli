"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RuleEditorModal } from "@/components/shared/RuleEditorModal";
import { ARCHIVE_CATEGORIES, categoryName } from "@/lib/data/categories";
import type { ArchiveCategoryCode, ArchivePiece, SortItem } from "@/types";

export function ArchiveClient() {
  const [pieces, setPieces] = useState<ArchivePiece[]>([]);
  const [sorted, setSorted] = useState<SortItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<ArchivePiece | null>(null);
  const [classifyRule, setClassifyRule] = useState("");
  const [sortRule, setSortRule] = useState("");
  const [ruleModal, setRuleModal] = useState<"classify" | "sort" | null>(null);

  useEffect(() => {
    fetch("/api/archive/rules")
      .then((r) => r.json())
      .then((j) => {
        setClassifyRule(j.data?.classify || "");
        setSortRule(j.data?.sort || "");
      });
  }, []);

  const categoryOptions = useMemo(
    () =>
      ARCHIVE_CATEGORIES.map((c) => ({
        value: c.code,
        label: `${c.code} ${c.name}`,
      })),
    []
  );

  async function onUploadDemo() {
    setBusy("upload");
    setSorted(null);
    try {
      // 模拟散件上传后自动读取文件名（件为单位）
      const res = await fetch("/api/archive/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useDemo: true }),
      });
      const json = await res.json();
      // 仅读取列表，尚未分类建议
      const list = (json.data || []).map((p: ArchivePiece) => ({
        ...p,
        suggestedCategory: undefined,
        confirmedCategory: undefined,
      }));
      setPieces(list);
    } finally {
      setBusy("");
    }
  }

  async function onClassify() {
    if (!pieces.length) return;
    setBusy("classify");
    try {
      const res = await fetch("/api/archive/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useDemo: true }),
      });
      const json = await res.json();
      setPieces(json.data || []);
      setSorted(null);
    } finally {
      setBusy("");
    }
  }

  async function onSort() {
    if (!pieces.length || pieces.some((p) => !p.confirmedCategory)) {
      alert("请先完成分类并核定");
      return;
    }
    setBusy("sort");
    try {
      const res = await fetch("/api/archive/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieces }),
      });
      const json = await res.json();
      if (json.error) {
        alert(json.error);
        return;
      }
      setSorted(json.data);
    } finally {
      setBusy("");
    }
  }

  async function onExport() {
    if (!sorted?.length) {
      alert("请先完成排序");
      return;
    }
    setBusy("export");
    try {
      const res = await fetch("/api/archive/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sorted,
          personName: "张三",
          personCode: pieces[0]?.personCode || "00001",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "人事档案目录_张三_00001.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy("");
    }
  }

  const emptySortTitles = ARCHIVE_CATEGORIES;

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col gap-3">
      <div className="rounded-2xl bg-white shadow-card px-4 py-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled title="系统对接占位">
          系统读取
        </Button>
        <Button variant="secondary" size="sm" disabled title="系统对接占位">
          读取预存目录
        </Button>
        <Button onClick={onUploadDemo} disabled={!!busy} size="sm">
          {busy === "upload" ? "读取中..." : "上传散件/批量（演示样本）"}
        </Button>
        <Button onClick={onClassify} disabled={!pieces.length || !!busy} size="sm">
          {busy === "classify" ? "分类中..." : "开始分类"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRuleModal("classify")}
        >
          修正分类规则
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRuleModal("sort")}
        >
          修正排序规则
        </Button>
        <Button onClick={onSort} disabled={!pieces.length || !!busy} size="sm">
          {busy === "sort" ? "排序中..." : "开始排序"}
        </Button>
        <Button onClick={onExport} disabled={!sorted || !!busy} size="sm">
          {busy === "export" ? "导出中..." : "导出目录"}
        </Button>
        <Button variant="ghost" size="sm" disabled title="系统对接占位">
          确认并返回主系统
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1 min-h-0">
        {/* 左侧：已读取材料 */}
        <section className="rounded-2xl bg-white shadow-card p-3 flex flex-col min-h-0">
          <h3 className="font-bold px-1 py-2">已读取文件（按件）</h3>
          <div className="flex-1 overflow-auto space-y-2">
            {pieces.length === 0 ? (
              <p className="text-sm text-[#7b8da0] p-4 text-center">
                上传后自动读取文件夹名，以「件」列出
              </p>
            ) : (
              pieces.map((p) => (
                <div
                  key={p.serialNo}
                  className="rounded-xl border border-[#e4ebf3] px-3 py-2 text-sm"
                >
                  <div className="font-semibold">{p.serialNo}</div>
                  <div className="text-[#7b8da0] mt-1">
                    {p.pageCount} 页
                    {p.materialName ? ` · ${p.materialName}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 中间：分类建议 */}
        <section className="rounded-2xl bg-white shadow-card p-3 flex flex-col min-h-0">
          <h3 className="font-bold px-1 py-2">分类建议</h3>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#f5f9fd] text-[#1a4b7a]">
                <tr>
                  <th className="text-left p-2">件号</th>
                  <th className="text-left p-2">智能分类</th>
                  <th className="text-left p-2">核定分类</th>
                  <th className="text-left p-2">查看</th>
                </tr>
              </thead>
              <tbody>
                {pieces
                  .filter((p) => p.suggestedCategory)
                  .map((p) => (
                    <tr key={p.serialNo} className="border-t border-[#eef2f7]">
                      <td className="p-2 align-top">
                        <div className="font-medium">{p.serialNo}</div>
                        <div className="text-xs text-[#7b8da0]">
                          {p.materialName}
                        </div>
                      </td>
                      <td className="p-2 align-top text-xs">
                        {categoryName(p.suggestedCategory || "")}
                      </td>
                      <td className="p-2 align-top">
                        <select
                          className="w-full rounded-lg border border-[#cfe0f5] px-2 py-1 text-xs"
                          value={p.confirmedCategory || p.suggestedCategory}
                          onChange={(e) => {
                            const code = e.target.value as ArchiveCategoryCode;
                            setPieces((prev) =>
                              prev.map((x) =>
                                x.serialNo === p.serialNo
                                  ? { ...x, confirmedCategory: code }
                                  : x
                              )
                            );
                            setSorted(null);
                          }}
                        >
                          {categoryOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <button
                          className="text-[#4a9eff] hover:underline text-xs"
                          onClick={() => setPreview(p)}
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!pieces.some((p) => p.suggestedCategory) ? (
              <p className="text-sm text-[#7b8da0] p-4 text-center">
                点击「开始分类」生成分类建议
              </p>
            ) : null}
          </div>
        </section>

        {/* 右侧：排序 */}
        <section className="rounded-2xl bg-white shadow-card p-3 flex flex-col min-h-0">
          <h3 className="font-bold px-1 py-2">排序结果</h3>
          <div className="flex-1 overflow-auto space-y-2">
            {!sorted ? (
              emptySortTitles.map((c) => (
                <div
                  key={c.code}
                  className="rounded-lg bg-[#f7fbff] border border-[#e4ebf3] px-3 py-2 text-sm text-[#1a4b7a]"
                >
                  {c.name}
                </div>
              ))
            ) : (
              sorted.map((g) => (
                <div
                  key={g.category}
                  className="rounded-xl border border-[#ddeafb] overflow-hidden"
                >
                  <div className="bg-[#eef6fe] px-3 py-2 text-sm font-semibold text-[#1a4b7a]">
                    {g.categoryName}
                  </div>
                  <div className="divide-y divide-[#eef2f7]">
                    {g.items.map((it) => (
                      <div key={it.formalNo} className="px-3 py-2 text-xs">
                        <div className="font-medium">
                          {it.formalNo} · {it.materialName}
                        </div>
                        <div className="text-[#7b8da0]">
                          {it.formDate} · {it.pageCount}页 · 原{it.serialNo}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-card">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold">扫描件预览 · {preview.serialNo}</h4>
              <button onClick={() => setPreview(null)}>关闭</button>
            </div>
            <p className="text-sm mb-2">材料名称：{preview.materialName}</p>
            <p className="text-sm mb-2">形成日期：{preview.formDate}</p>
            <p className="text-sm mb-4">摘要：{preview.summary}</p>
            <div className="rounded-xl bg-[#f5f8fc] border border-dashed border-[#cfe0f5] h-48 flex items-center justify-center text-[#7b8da0] text-sm">
              共 {preview.pageCount} 页 JPG（演示环境以元数据代替原图）
            </div>
          </div>
        </div>
      ) : null}

      <RuleEditorModal
        open={ruleModal === "classify"}
        title="分类规则"
        value={classifyRule}
        onClose={() => setRuleModal(null)}
        onSave={async (next) => {
          const res = await fetch("/api/archive/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classify: next }),
          });
          const j = await res.json();
          setClassifyRule(j.data.classify);
        }}
      />
      <RuleEditorModal
        open={ruleModal === "sort"}
        title="排序规则"
        value={sortRule}
        onClose={() => setRuleModal(null)}
        onSave={async (next) => {
          const res = await fetch("/api/archive/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort: next }),
          });
          const j = await res.json();
          setSortRule(j.data.sort);
        }}
      />
    </div>
  );
}
