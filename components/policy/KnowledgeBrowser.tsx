"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Doc = {
  id: string;
  title: string;
  sourceFile: string;
  content: string;
  cozeDocumentId?: string;
};

function norm(t: string) {
  return (t || "")
    .replace(/[《》【】\[\]\s]/g, "")
    .replace(/\.docx$/i, "")
    .replace(/^\d+[-_]/, "")
    .toLowerCase();
}

export function KnowledgeBrowser() {
  const searchParams = useSearchParams();
  const qId = searchParams.get("id") || "";
  const qTitle = searchParams.get("title") || "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<Doc | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tip, setTip] = useState("");
  const [cozeConfigured, setCozeConfigured] = useState(false);

  async function loadList(preferId?: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/policy/knowledge");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "加载失败");
      const list = (j.data || []) as Doc[];
      setDocs(list);
      setCozeConfigured(!!j.cozeConfigured);
      const pickId = preferId || active?.id || qId;
      const byId = pickId
        ? list.find((d) => d.id === pickId || d.id === String(pickId))
        : null;
      const byTitle = qTitle
        ? list.find((d) => {
            const nt = norm(d.title);
            const nq = norm(qTitle);
            return (
              nt === nq ||
              nt.includes(nq) ||
              nq.includes(nt) ||
              norm(d.sourceFile).includes(nq)
            );
          })
        : null;
      setActive(byId || byTitle || list[0] || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qId, qTitle]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.sourceFile.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
    );
  }, [docs, filter]);

  async function onUploadFile(file: File) {
    if (!/\.docx$/i.test(file.name)) {
      setError("仅支持上传 .docx 文件");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy("upload");
    setError("");
    setTip("正在上传到扣子知识库…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/policy/knowledge", {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "上传失败");
      setTip(`已上传并同步扣子：${j.data?.title || file.name}`);
      await loadList(j.data?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTip("");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete() {
    if (!active) return;
    if (
      !window.confirm(
        `确认删除《${active.title}》？将同时从本地与扣子知识库移除。`
      )
    ) {
      return;
    }
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`/api/policy/knowledge/${active.id}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "删除失败");
      setTip("已删除");
      setActive(null);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-card p-5 h-[calc(100vh-110px)] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold">政策知识库原文</h2>
          <p className="text-xs text-[#7b8da0] mt-0.5">
            共 {docs.length} 份 · 仅支持上传 docx，同步到扣子知识库
            {cozeConfigured ? "（已配置）" : "（未配置 COZE_DATASET_ID）"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadFile(f);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!!busy || !cozeConfigured}
            onClick={() => fileRef.current?.click()}
          >
            {busy === "upload" ? "上传中…" : "上传 docx"}
          </Button>
          <Link href="/policy">
            <Button variant="secondary" size="sm">
              返回问答
            </Button>
          </Link>
        </div>
      </div>

      {(error || tip) && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            error
              ? "bg-rose-50 text-rose-700 border border-rose-100"
              : "bg-[#eef6fe] text-[#1a4b7a] border border-[#cfe3f8]"
          }`}
        >
          {error || tip}
        </div>
      )}

      <div className="mb-3">
        <input
          className="w-full max-w-md rounded-lg border border-[#b6d4f5] bg-[#f7fafd] px-3 py-2 text-sm outline-none focus:border-[#4a9eff]"
          placeholder="搜索标题或正文…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
        <div className="overflow-auto border border-[#e4ebf3] rounded-xl">
          {loading ? (
            <p className="px-3 py-6 text-sm text-[#7b8da0]">加载知识库…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[#7b8da0]">无匹配文档</p>
          ) : (
            filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`w-full text-left px-3 py-3 border-b border-[#eef2f7] text-sm hover:bg-[#eef6fe] ${
                  active?.id === d.id
                    ? "bg-[#eef6fe] text-[#1a4b7a] font-semibold"
                    : ""
                }`}
                onClick={() => {
                  setActive(d);
                  setError("");
                  setTip("");
                }}
              >
                <span className="block truncate">{d.title}</span>
                <span className="mt-1 block text-[11px] font-normal text-[#7b8da0]">
                  {d.cozeDocumentId ? "已同步扣子" : "仅本地"}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="overflow-auto rounded-xl bg-[#f7fbff] border border-[#e4ebf3] p-5">
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <h3 className="text-xl font-bold">{active.title}</h3>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => void onDelete()}
                  >
                    {busy === "delete" ? "删除中…" : "删除"}
                  </Button>
                  {active.sourceFile ? (
                    <a
                      href={`/api/policy/file?name=${encodeURIComponent(active.sourceFile)}`}
                      className="inline-flex items-center px-3 py-1.5 text-sm text-[#2f6fc0] hover:underline"
                    >
                      下载 docx
                    </a>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-[#7b8da0] mb-4">
                {active.sourceFile || "—"}
                {active.cozeDocumentId
                  ? ` · 扣子文档 ${active.cozeDocumentId}`
                  : " · 尚未同步扣子"}
              </p>
              <pre className="whitespace-pre-wrap text-sm leading-7 font-sans">
                {active.content}
              </pre>
            </>
          ) : (
            <p className="text-[#7b8da0]">
              {loading ? "加载中…" : "暂无知识库内容"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
