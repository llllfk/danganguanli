"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import type { AuthUser } from "@/types";

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [tip, setTip] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        const u = j.data?.user as AuthUser | null;
        setUser(u || null);
        if (u) {
          setDisplayName(u.displayName || "");
          setPhone(u.phone || "");
        }
      })
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function openProfile() {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setPhone(user.phone || "");
    setCurrentPassword("");
    setPassword("");
    setErr("");
    setTip("");
    setOpen(false);
    setProfileOpen(true);
  }

  async function saveProfile() {
    setSaving(true);
    setErr("");
    setTip("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          phone,
          currentPassword: password ? currentPassword : undefined,
          password: password || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || `保存失败（HTTP ${res.status}）`);
      }
      const next = json.data?.user as AuthUser;
      setUser(next);
      setTip("已保存");
      setCurrentPassword("");
      setPassword("");
      window.setTimeout(() => {
        setProfileOpen(false);
        setTip("");
      }, 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="relative z-[60] ml-auto flex items-center shrink-0"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          className="relative z-[60] flex items-center gap-3 text-white hover:opacity-95"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="text-right leading-tight">
            <div className="text-base font-medium">
              {user?.displayName || "档案管理员"}
            </div>
            <div className="text-[11px] text-white/80">
              {user?.role === "admin" ? "管理员" : "档案员"}
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-gradient-to-b from-[#3d82d0] to-[#1f5ea0] border-2 border-white/40 flex items-center justify-center text-sm font-bold shrink-0">
            {(user?.displayName || "档").slice(0, 1)}
          </div>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-[70] pt-1 min-w-[148px]"
          >
            <div className="rounded-xl border border-[#d4e3f5] bg-white shadow-[0_8px_24px_rgba(26,74,122,0.22)] overflow-hidden py-1">
              <button
                type="button"
                role="menuitem"
                onClick={openProfile}
                className="w-full px-4 py-2.5 text-left text-[14px] text-[#1f2937] hover:bg-[#eef6fe]"
              >
                个人信息
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="w-full px-4 py-2.5 text-left text-[14px] text-[#b42318] hover:bg-[#fff1f0]"
              >
                退出登录
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={profileOpen}
        title="个人信息"
        onClose={() => setProfileOpen(false)}
        width="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              className="h-10 px-4 rounded-[8px] border border-[#c5d3e3] bg-white text-[#334155] text-sm"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={saveProfile}
              className="h-10 px-4 rounded-[8px] bg-[#4a9eff] text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {err ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
              {err}
            </p>
          ) : null}
          {tip ? (
            <p className="rounded-lg border border-[#cfe0f5] bg-[#eef6fe] px-3 py-2 text-[#1a4b7a]">
              {tip}
            </p>
          ) : null}
          <label className="block space-y-1">
            <span className="text-[#5b6f88]">显示名称</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#c5daf5] px-3 outline-none focus:border-[#4a9eff]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[#5b6f88]">登录手机号</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#c5daf5] px-3 outline-none focus:border-[#4a9eff]"
              inputMode="numeric"
            />
          </label>
          <p className="text-[12px] text-[#7b8da0] pt-1">
            修改密码（可选，留空则不改）
          </p>
          <label className="block space-y-1">
            <span className="text-[#5b6f88]">当前密码</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#c5daf5] px-3 outline-none focus:border-[#4a9eff]"
              autoComplete="current-password"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[#5b6f88]">新密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#c5daf5] px-3 outline-none focus:border-[#4a9eff]"
              autoComplete="new-password"
            />
          </label>
          <p className="text-[12px] text-[#94a3b8]">
            角色：{user?.role === "admin" ? "管理员" : "档案员"}（不可在此修改）
          </p>
        </div>
      </Modal>
    </>
  );
}
