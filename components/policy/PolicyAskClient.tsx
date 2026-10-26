"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PolicyHistoryItem } from "@/types";
import { formatDateTime } from "@/lib/utils";

type AskResult = {
  answer: string;
  found: boolean;
  sources: Array<{ title: string; excerpt: string; sourceFile: string }>;
};

export function PolicyAskClient() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [history, setHistory] = useState<PolicyHistoryItem[]>([]);

  async function loadHistory() {
    const res = await fetch("/api/policy/history");
    const json = await res.json();
    setHistory(json.data || []);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function onAsk(q?: string) {
    const text = (q ?? question).trim();
    if (!text) return;
    setLoading(true);
    setQuestion(text);
    try {
      const res = await fetch("/api/policy/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();
      if (json.error) {
        setResult({ answer: json.error, found: false, sources: [] });
      } else {
        setResult(json.data);
      }
      await loadHistory();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-110px)]">
      <section className="rounded-2xl bg-white shadow-card p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#1f2d42]">近期提问</h2>
          <Link
            href="/policy/knowledge"
            className="text-sm text-[#4a9eff] hover:underline"
          >
            管理知识库
          </Link>
        </div>
        <div className="flex-1 overflow-auto space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-[#7b8da0] py-8 text-center">暂无提问记录</p>
          ) : (
            history.map((h) => (
              <button
                key={h.id}
                className="w-full text-left rounded-xl border border-[#e4ebf3] px-3 py-2 hover:bg-[#eef6fe] transition"
                onClick={() => onAsk(h.question)}
              >
                <div className="text-sm font-medium line-clamp-2">{h.question}</div>
                <div className="text-xs text-[#7b8da0] mt-1">
                  {formatDateTime(h.createdAt)}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-card p-5 flex flex-col anim-fade-up">
        <h2 className="text-lg font-bold mb-4">政策问答</h2>
        <div className="flex gap-3">
          <input
            className="flex-1 rounded-xl border border-[#cfe0f5] px-4 py-3 outline-none focus:border-[#4a9eff]"
            placeholder="例如：干部档案第四类下设哪几个子类 / 出生日期认定按什么规则 / 专项审核"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAsk();
            }}
          />
          <Button onClick={() => onAsk()} disabled={loading}>
            {loading ? "检索中..." : "提问"}
          </Button>
        </div>

        <div className="mt-5 flex-1 overflow-auto rounded-xl bg-[#f7fbff] border border-[#e4ebf3] p-5">
          {!result ? (
            <p className="text-[#7b8da0]">
              答案严格来自已上传政策知识库，知识库无相关内容时返回「未找到相关政策依据」。
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#7b8da0] mb-1">答复</div>
                <p className="text-base leading-7 font-medium text-[#1f2d42]">
                  {result.answer}
                </p>
              </div>
              {result.found && result.sources.length > 0 ? (
                <div>
                  <div className="text-sm text-[#7b8da0] mb-2">政策出处</div>
                  <div className="space-y-3">
                    {result.sources.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-xl bg-white border border-[#ddeafb] p-3"
                      >
                        <div className="font-semibold text-[#2f6fc0]">
                          {s.title}
                        </div>
                        <div className="text-xs text-[#7b8da0] mt-1">
                          {s.sourceFile}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#1f2d42]">
                          {s.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
