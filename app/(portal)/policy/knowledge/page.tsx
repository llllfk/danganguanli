"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Doc = {
  id: string;
  title: string;
  sourceFile: string;
  content: string;
};

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState<Doc | null>(null);

  useEffect(() => {
    fetch("/api/policy/knowledge")
      .then((r) => r.json())
      .then((j) => {
        setDocs(j.data || []);
        setActive((j.data || [])[0] || null);
      });
  }, []);

  return (
    <div className="rounded-2xl bg-white shadow-card p-5 h-[calc(100vh-110px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">政策知识库原文</h2>
        <Link href="/policy">
          <Button variant="secondary" size="sm">
            返回问答
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
        <div className="overflow-auto border border-[#e4ebf3] rounded-xl">
          {docs.map((d) => (
            <button
              key={d.id}
              className={`w-full text-left px-3 py-3 border-b border-[#eef2f7] text-sm hover:bg-[#eef6fe] ${
                active?.id === d.id ? "bg-[#eef6fe] text-[#1a4b7a] font-semibold" : ""
              }`}
              onClick={() => setActive(d)}
            >
              {d.title}
            </button>
          ))}
        </div>
        <div className="overflow-auto rounded-xl bg-[#f7fbff] border border-[#e4ebf3] p-5">
          {active ? (
            <>
              <h3 className="text-xl font-bold mb-2">{active.title}</h3>
              <p className="text-xs text-[#7b8da0] mb-4">{active.sourceFile}</p>
              <pre className="whitespace-pre-wrap text-sm leading-7 font-sans">
                {active.content}
              </pre>
            </>
          ) : (
            <p className="text-[#7b8da0]">暂无知识库内容</p>
          )}
        </div>
      </div>
    </div>
  );
}
