"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { PolicyConversation, PolicyHistoryItem } from "@/types";
import { formatDateTime } from "@/lib/utils";

type ChatTurn = {
  /** React 列表稳定 key，提问后不改，避免整块重挂载闪屏 */
  clientKey: string;
  id: string;
  question: string;
  answer: string;
  found: boolean;
  thinkingMs: number;
  provider?: string;
  createdAt: string;
  sources?: Array<{
    id?: string;
    title: string;
    excerpt: string;
    sourceFile: string;
  }>;
  pending?: boolean;
};

function formatThinking(ms: number) {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `思考 ${ms} ms`;
  return `思考 ${(ms / 1000).toFixed(1)} 秒`;
}

function providerLabel(p?: string) {
  if (p === "coze-bot") return "扣子智能体";
  if (p === "db-fallback") return "本地库兜底";
  if (p === "db") return "本地知识库";
  return "";
}

function BookIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path d="M6 10 Q24 4 24 8 L24 42 Q24 38 6 44 Z" fill="#4a9eff" />
      <path d="M42 10 Q24 4 24 8 L24 42 Q24 38 42 44 Z" fill="#3b82f6" />
      <line x1="24" y1="8" x2="24" y2="42" stroke="#1e5ea0" strokeWidth="1.5" />
    </svg>
  );
}

function ChartBarsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="7" width="3.5" height="7" rx="0.8" fill="#22c55e" />
      <rect x="6.25" y="4" width="3.5" height="10" rx="0.8" fill="#ef4444" />
      <rect x="11.5" y="6" width="3.5" height="8" rx="0.8" fill="#3b82f6" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 36 36" fill="none" aria-hidden>
      <line
        x1="6"
        y1="6"
        x2="20"
        y2="20"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M20 20 L30 13 L34 17 L28 28 Z" fill="currentColor" />
    </svg>
  );
}

function BubbleEmptyIcon() {
  return (
    <svg
      width="72"
      height="64"
      viewBox="0 0 140 120"
      fill="none"
      aria-hidden
      className="mx-auto"
    >
      <path
        d="M20 48 Q20 16 70 16 Q120 16 120 48 Q120 80 70 80 Q48 80 32 80 L18 100 L24 78 Q20 66 20 48 Z"
        fill="#ffffff"
        stroke="#9ca3af"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width="18" height="22" viewBox="0 0 32 40" fill="none" aria-hidden>
      <path
        d="M16 4 Q6 4 6 15 Q6 22 12 26 L12 32 L20 32 L20 26 Q26 22 26 15 Q26 4 16 4 Z"
        fill="#fbbf24"
      />
      <rect x="12" y="32" width="8" height="4" fill="#d97706" />
      <rect x="13" y="37" width="6" height="3" fill="#d97706" />
    </svg>
  );
}

export function PolicyAskClient() {
  const [conversations, setConversations] = useState<PolicyConversation[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PolicyConversation | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState("");
  const [docView, setDocView] = useState<{
    id: string;
    title: string;
    sourceFile: string;
    content: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const thinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function openSourceDoc(s: {
    id?: string;
    title: string;
    sourceFile: string;
  }) {
    setDocOpen(true);
    setDocLoading(true);
    setDocError("");
    setDocView(null);
    try {
      const qs = s.id
        ? `id=${encodeURIComponent(s.id)}`
        : `title=${encodeURIComponent(s.title)}${
            s.sourceFile
              ? `&file=${encodeURIComponent(s.sourceFile)}`
              : ""
          }`;
      const res = await fetch(`/api/policy/knowledge/doc?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data) {
        throw new Error(json.error || "未找到对应政策原文");
      }
      setDocView(json.data);
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "打开原文失败");
    } finally {
      setDocLoading(false);
    }
  }

  function networkError(e: unknown, fallback: string) {
    const msg = e instanceof Error ? e.message : String(e || "");
    if (
      e instanceof TypeError ||
      /Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)
    ) {
      return "无法连接服务器。请确认已在「代码」目录运行 npm run dev，并用 http://localhost:3000/policy 打开";
    }
    return msg || fallback;
  }

  async function loadConversations(
    preferId?: string | null,
    opts?: { skipMessages?: boolean }
  ) {
    const res = await fetch("/api/policy/history");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `加载会话失败（HTTP ${res.status}）`);
    }
    if (json.error) throw new Error(json.error);
    const list = (json.data?.conversations || []) as PolicyConversation[];
    setConversations(list);
    if (Array.isArray(json.data?.recentQuestions)) {
      setRecentQuestions(json.data.recentQuestions as string[]);
    }
    // 提问刚成功时只刷新左侧列表，勿再 loadMessages，否则会冲掉带 sources 的气泡导致闪屏
    if (opts?.skipMessages) {
      if (preferId) setActiveId(preferId);
      return;
    }
    // 不自动选中首条会话，保持参考图空态；仅在指定 preferId 或已有 activeId 时加载消息
    const next =
      preferId && list.some((c) => c.conversationId === preferId)
        ? preferId
        : activeId && list.some((c) => c.conversationId === activeId)
          ? activeId
          : null;
    if (next) {
      setActiveId(next);
      await loadMessages(next);
    } else if (preferId === null) {
      setActiveId(null);
      setTurns([]);
    }
  }

  async function loadMessages(conversationId: string) {
    const res = await fetch(
      `/api/policy/history?conversationId=${encodeURIComponent(conversationId)}`
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `加载消息失败（HTTP ${res.status}）`);
    }
    if (json.error) throw new Error(json.error);
    const messages = (json.data?.messages || []) as PolicyHistoryItem[];
    setTurns(
      messages.map((m) => ({
        clientKey: `msg-${m.id}`,
        id: m.id,
        question: m.question,
        answer: m.answer,
        found: m.found,
        thinkingMs: m.thinkingMs || 0,
        provider: m.provider,
        createdAt: m.createdAt,
        sources: m.sources || [],
      }))
    );
  }

  /** 只刷新会话列表与近期提问，绝不碰当前 turns */
  async function refreshConversationList() {
    const res = await fetch("/api/policy/history");
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) return;
    setConversations((json.data?.conversations || []) as PolicyConversation[]);
    if (Array.isArray(json.data?.recentQuestions)) {
      setRecentQuestions(json.data.recentQuestions as string[]);
    }
  }

  useEffect(() => {
    loadConversations().catch((e) => setError(networkError(e, "加载失败")));
    return () => {
      if (thinkTimer.current) clearInterval(thinkTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, loading]);

  useEffect(() => {
    if (!historyOpen) return;
    function onDocClick(e: MouseEvent) {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [historyOpen]);

  function startNewChat() {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `conv-${crypto.randomUUID()}`
        : `conv-${Date.now()}`;
    setActiveId(id);
    setTurns([]);
    setQuestion("");
    setError("");
  }

  function clearConversation() {
    if (turns.length === 0 && !question.trim()) {
      startNewChat();
      return;
    }
    setClearConfirm(true);
  }

  async function onConfirmClear() {
    setClearConfirm(false);
    const id = activeId;
    if (id && conversations.some((c) => c.conversationId === id)) {
      setDeleting(true);
      setError("");
      try {
        const res = await fetch(
          `/api/policy/history?conversationId=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "清空失败");
        setActiveId(null);
        setTurns([]);
        setQuestion("");
        await loadConversations(null);
        startNewChat();
      } catch (e) {
        setError(networkError(e, "清空失败"));
      } finally {
        setDeleting(false);
      }
    } else {
      startNewChat();
    }
  }

  async function selectConversation(id: string) {
    setActiveId(id);
    setError("");
    setHistoryOpen(false);
    try {
      await loadMessages(id);
    } catch (e) {
      setError(networkError(e, "加载会话失败"));
    }
  }

  async function onDeleteConversation() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const id = deleteTarget.conversationId;
      const res = await fetch(
        `/api/policy/history?conversationId=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "删除失败");
      setDeleteTarget(null);
      if (activeId === id) {
        setActiveId(null);
        setTurns([]);
      }
      await loadConversations(null);
    } catch (e) {
      setError(networkError(e, "删除失败"));
    } finally {
      setDeleting(false);
    }
  }

  async function onAsk() {
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    setError("");
    setThinkingElapsed(0);
    const t0 = Date.now();
    if (thinkTimer.current) clearInterval(thinkTimer.current);
    thinkTimer.current = setInterval(() => {
      setThinkingElapsed(Date.now() - t0);
    }, 200);

    const clientKey = `temp-${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        clientKey,
        id: clientKey,
        question: text,
        answer: "",
        found: false,
        thinkingMs: 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    setQuestion("");

    try {
      const res = await fetch("/api/policy/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          conversationId: activeId || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.error || `提问失败（HTTP ${res.status}），请稍后重试`
        );
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const data = json.data as {
        id: string;
        answer: string;
        found: boolean;
        sources: ChatTurn["sources"];
        provider?: string;
        conversationId: string;
        thinkingMs: number;
        createdAt: string;
      };

      // 只就地更新内容，clientKey 不变 → 不重挂载，避免卡片闪成气泡
      setTurns((prev) =>
        prev.map((t) =>
          t.clientKey === clientKey
            ? {
                ...t,
                id: data.id,
                question: text,
                answer: data.answer,
                found: data.found,
                thinkingMs: data.thinkingMs,
                provider: data.provider,
                createdAt: data.createdAt,
                sources: data.sources || [],
                pending: false,
              }
            : t
        )
      );
      setActiveId(data.conversationId);
      try {
        await refreshConversationList();
      } catch {
        /* ignore */
      }
    } catch (e) {
      setTurns((prev) => prev.filter((t) => t.clientKey !== clientKey));
      setError(networkError(e, "提问失败"));
    } finally {
      if (thinkTimer.current) clearInterval(thinkTimer.current);
      thinkTimer.current = null;
      setLoading(false);
      setThinkingElapsed(0);
    }
  }

  function fillSuggested(q: string) {
    setQuestion(q);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const activeTitle = useMemo(() => {
    if (!activeId) return "";
    return (
      conversations.find((c) => c.conversationId === activeId)?.title || ""
    );
  }, [activeId, conversations]);

  return (
    <div className="h-[calc(100vh-110px)] min-h-0">
      <section className="h-full rounded-2xl bg-white border border-[#e2e8f0] shadow-card flex flex-col overflow-hidden">
        {/* 卡片头：标题 + 操作 */}
        <div className="shrink-0 px-5 py-4 flex items-center justify-between gap-3 border-b border-[#eef2f7]">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookIcon />
            <h1 className="text-[20px] font-bold text-[#16324f] truncate">
              档案政策智能问答
            </h1>
            {conversations.length > 0 ? (
              <div className="relative" ref={historyRef}>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="text-xs text-[#7b8da0] hover:text-[#2f6fc0] px-2 py-1 rounded-md hover:bg-[#eef6fe] transition"
                >
                  历史 ({conversations.length})
                </button>
                {historyOpen ? (
                  <div className="absolute left-0 top-full mt-1 z-20 w-72 max-h-72 overflow-auto rounded-xl border border-[#e2e8f0] bg-white shadow-lg p-2">
                    <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                      <span className="text-xs font-medium text-[#5b7a99]">
                        历史会话
                      </span>
                      <button
                        type="button"
                        className="text-xs text-[#4a9eff] hover:underline"
                        onClick={() => {
                          startNewChat();
                          setHistoryOpen(false);
                        }}
                      >
                        新对话
                      </button>
                    </div>
                    {conversations.map((c) => {
                      const active = c.conversationId === activeId;
                      return (
                        <div
                          key={c.conversationId}
                          className={`group flex items-start gap-1 rounded-lg px-2 py-2 ${
                            active ? "bg-[#eef6fe]" : "hover:bg-[#f7fbff]"
                          }`}
                        >
                          <button
                            type="button"
                            className="flex-1 text-left min-w-0"
                            onClick={() => selectConversation(c.conversationId)}
                          >
                            <div className="text-sm text-[#1f2d42] line-clamp-2">
                              {c.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#7b8da0]">
                              {c.messageCount} 轮 · {formatDateTime(c.lastAt)}
                            </div>
                          </button>
                          <button
                            type="button"
                            className="shrink-0 text-[11px] text-[#94a3b8] hover:text-rose-600 opacity-0 group-hover:opacity-100 transition px-1"
                            onClick={() => {
                              setDeleteTarget(c);
                              setHistoryOpen(false);
                            }}
                          >
                            删除
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
            {activeTitle && turns.length > 0 ? (
              <span className="hidden xl:inline text-xs text-[#94a3b8] truncate max-w-[160px]">
                {activeTitle}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/policy/knowledge"
              className="inline-flex items-center gap-2 h-[36px] px-3.5 rounded-[10px] bg-white border-2 border-[#d0d7e2] text-sm text-[#334155] hover:bg-[#f8fafc] transition"
              title="查看知识库全部政策原文"
            >
              <ChartBarsIcon />
              知识库原文
            </Link>
            <button
              type="button"
              onClick={clearConversation}
              disabled={deleting}
              className="inline-flex items-center gap-2 h-[36px] px-3.5 rounded-[10px] bg-[#4a9eff] text-white text-sm hover:bg-[#2f6fc0] transition disabled:opacity-50"
            >
              <ClearIcon />
              清空对话
            </button>
          </div>
        </div>

        {/* 聊天区 */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-5 space-y-4">
          {turns.length === 0 && !loading ? (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center">
              <BubbleEmptyIcon />
              <p className="mt-3 text-[17px] text-[#94a3b8]">请输入问题</p>
            </div>
          ) : null}

          {turns.map((t) => (
            <div key={t.clientKey} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%]">
                  <div className="text-[11px] text-[#7b8da0] text-right mb-1">
                    {formatDateTime(t.createdAt)}
                  </div>
                  <div className="rounded-2xl rounded-tr-md bg-[#4a9eff] text-white px-4 py-2.5 text-sm leading-6 shadow-sm whitespace-pre-wrap">
                    {t.question}
                  </div>
                </div>
              </div>

              <div className="flex justify-start">
                <div className="max-w-[90%]">
                  <div className="text-[11px] text-[#7b8da0] mb-1 flex flex-wrap items-center gap-2">
                    {t.pending ? (
                      <span className="text-[#2f6fc0] anim-pulse-soft">
                        正在思考… {formatThinking(thinkingElapsed)}
                      </span>
                    ) : (
                      <>
                        <span>{formatThinking(t.thinkingMs)}</span>
                        {t.provider ? (
                          <span className="rounded bg-[#f8fafc] border border-[#ddeafb] px-1.5 py-0.5 text-[#2f6fc0]">
                            {providerLabel(t.provider)}
                          </span>
                        ) : null}
                        <span>{formatDateTime(t.createdAt)}</span>
                      </>
                    )}
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-[#f8fafc] border border-[#e4ebf3] px-4 py-3 text-sm leading-7 text-[#1f2d42] shadow-sm whitespace-pre-wrap">
                    {t.pending ? (
                      <span className="text-[#7b8da0]">
                        检索知识库并组织答复中…
                      </span>
                    ) : (
                      t.answer
                    )}
                  </div>
                  {!t.pending && t.found && t.sources && t.sources.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {t.sources.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => openSourceDoc(s)}
                          className="w-full text-left rounded-xl bg-[#eef6fe] border border-[#ddeafb] px-3 py-2 text-xs hover:border-[#4a9eff] hover:bg-[#e4f1fc] transition group"
                        >
                          <div className="font-semibold text-[#2f6fc0] flex items-center justify-between gap-2">
                            <span>{s.title}</span>
                            <span className="shrink-0 text-[11px] font-normal text-[#7b8da0] group-hover:text-[#2f6fc0]">
                              打开原文 →
                            </span>
                          </div>
                          <p className="mt-1 text-[#1f2d42] leading-5">
                            {s.excerpt}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div className="mx-5 mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* 近期提问：真实历史，非写死模拟 */}
        <div className="shrink-0 mx-4 mb-3 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-1.5 shrink-0">
            <BulbIcon />
            <span className="text-sm font-bold text-[#16324f] whitespace-nowrap">
              近期提问：
            </span>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
            {recentQuestions.length === 0 ? (
              <span className="text-[13px] text-[#94a3b8] whitespace-nowrap">
                暂无提问记录，发送后将显示在此
              </span>
            ) : (
              recentQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => fillSuggested(q)}
                  disabled={loading}
                  title={q}
                  className="shrink-0 max-w-[240px] truncate rounded-lg border-2 border-[#a9cdf5] bg-white px-3 py-1.5 text-[13px] text-[#334155] hover:bg-[#eef6fe] hover:border-[#4a9eff] transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))
            )}
          </div>
        </div>

        {/* 输入栏 */}
        <div className="shrink-0 mx-4 mb-4 rounded-xl border-2 border-[#d0d7e2] overflow-hidden flex items-stretch bg-white">
          <textarea
            ref={inputRef}
            rows={1}
            value={question}
            disabled={loading}
            placeholder="输入问题，按 Enter 发送..."
            className="flex-1 min-w-0 resize-none border-0 outline-none bg-transparent px-4 py-3.5 text-[15px] text-[#1f2d42] placeholder:text-[#94a3b8] leading-6 max-h-28"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onAsk();
              }
            }}
          />
          <button
            type="button"
            onClick={onAsk}
            disabled={loading || !question.trim()}
            className="shrink-0 w-[100px] border-l-2 border-[#d0d7e2] bg-[#f1f5f9] text-[#64748b] text-[15px] hover:bg-[#e2e8f0] hover:text-[#334155] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "思考中…" : "发送"}
          </button>
        </div>
      </section>

      <ConfirmModal
        open={!!deleteTarget}
        title="删除会话"
        message={`确认删除会话「${deleteTarget?.title || "未命名"}」？删除后列表中不再显示（可恢复需库内操作）。`}
        confirmText="删除"
        danger
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDeleteConversation}
      />

      <ConfirmModal
        open={clearConfirm}
        title="清空对话"
        message="确认清空当前对话？已保存的会话记录将被删除。"
        confirmText="清空"
        danger
        busy={deleting}
        onClose={() => setClearConfirm(false)}
        onConfirm={onConfirmClear}
      />

      <Modal
        open={docOpen}
        title={docView?.title || "政策原文"}
        onClose={() => setDocOpen(false)}
        width="xl"
        footer={
          <>
            {docView?.sourceFile ? (
              <a
                href={`/api/policy/file?name=${encodeURIComponent(docView.sourceFile)}`}
                className="inline-flex"
              >
                <Button variant="secondary" type="button">
                  下载 docx
                </Button>
              </a>
            ) : null}
            <Button type="button" onClick={() => setDocOpen(false)}>
              关闭
            </Button>
          </>
        }
      >
        {docLoading ? (
          <p className="text-sm text-[#7b8da0]">正在加载原文…</p>
        ) : docError ? (
          <p className="text-sm text-rose-600">{docError}</p>
        ) : docView ? (
          <>
            <p className="text-xs text-[#7b8da0] mb-3">{docView.sourceFile}</p>
            <pre className="whitespace-pre-wrap text-sm leading-7 font-sans text-[#1f2d42]">
              {docView.content}
            </pre>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
