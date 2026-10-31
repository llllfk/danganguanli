"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Field } from "@/components/ui/Field";

export function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const username = account.trim();
    if (!username) {
      setError("请输入账号");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "登录失败");
      const next = search.get("next") || "/policy";
      router.replace(next.startsWith("/") ? next : "/policy");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-stage min-h-screen grid lg:grid-cols-2">
      <section className="login-hero relative overflow-hidden text-white px-8 py-12 md:px-14 md:py-16 flex flex-col min-h-[42vh] lg:min-h-screen">
        <div className="login-grid" aria-hidden />
        <div className="login-scan" aria-hidden />
        <div className="login-orb login-orb-a" aria-hidden />
        <div className="login-orb login-orb-b" aria-hidden />

        <div className="relative z-10 flex-1 flex items-center">
          <h1 className="login-fade-1 font-[family-name:var(--font-login-display)] text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-wide">
            <span className="block whitespace-nowrap text-[#7dd3fc]">干部人事档案</span>
            <span className="mt-5 md:mt-7 block whitespace-nowrap text-white">智能辅助系统</span>
          </h1>
        </div>

        <div className="relative z-10 text-xs text-[#7b93ad] tracking-wide login-fade-3">
          内部测试环境·单机离线运行
        </div>
      </section>

      <section className="relative bg-[#f3f7fb] flex items-center justify-center px-6 py-12">
        <div className="login-right-glow" aria-hidden />
        <div className="login-fade-2 relative w-full max-w-[420px]">
          <div className="mb-8">
            <h2 className="font-[family-name:var(--font-login-display)] text-3xl text-[#0f2744]">
              欢迎回来
            </h2>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-3xl bg-white border border-[#d7e4f2] shadow-[0_24px_60px_-28px_rgba(15,55,100,0.45)] p-7 space-y-5"
          >
            <Field
              label="账号"
              value={account}
              autoComplete="username"
              onChange={(e) => {
                setAccount(e.target.value);
                if (error) setError("");
              }}
              placeholder="请输入账号"
            />
            <Field
              label="密码"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="login-submit relative w-full overflow-hidden rounded-xl bg-[#0b4f8a] text-white py-3.5 font-semibold tracking-wide transition hover:bg-[#0a4578] disabled:opacity-60"
            >
              <span className="relative z-10">
                {busy ? "正在核验身份…" : "进入系统"}
              </span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
