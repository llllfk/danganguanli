"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Doc = {
  id: string;
  title: string;
  sourceFile: string;
  content: string;
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
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<Doc | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/policy/knowledge")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data || []) as Doc[];
        setDocs(list);
        const byId = qId
          ? list.find((d) => d.id === qId || d.id === String(qId))
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
      })
      .finally(() => setLoading(false));
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

  return (
    <div className="rounded-2xl bg-white shadow-card p-5 h-[calc(100vh-110px)] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold">政策知识库原文</h2>
          <p className="text-xs text-[#7b8da0] mt-0.5">
            共 {docs.length} 份 · 点击左侧文档查看全文
          </p>
        </div>
        <Link href="/policy">
          <Button variant="secondary" size="sm">
            返回问答
          </Button>
        </Link>
      </div>
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
                onClick={() => setActive(d)}
              >
                {d.title}
              </button>
            ))
          )}
        </div>
        <div className="overflow-auto rounded-xl bg-[#f7fbff] border border-[#e4ebf3] p-5">
          {active ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <h3 className="text-xl font-bold">{active.title}</h3>
                {active.sourceFile ? (
                  <a
                    href={`/api/policy/file?name=${encodeURIComponent(active.sourceFile)}`}
                    className="shrink-0 text-sm text-[#2f6fc0] hover:underline"
                  >
                    下载 docx
                  </a>
                ) : null}
              </div>
              <p className="text-xs text-[#7b8da0] mb-4">{active.sourceFile}</p>
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
