"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { SysUser, UserRole } from "@/types";
import { formatDateTime } from "@/lib/utils";

const emptyForm = {
  phone: "",
  displayName: "",
  password: "",
  role: "user" as UserRole,
};

function isCnMobile(v: string) {
  return /^1[3-9]\d{9}$/.test(v.trim());
}

export function UsersAdminClient() {
  const [users, setUsers] = useState<SysUser[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editUser, setEditUser] = useState<SysUser | null>(null);
  const [edit, setEdit] = useState({
    phone: "",
    displayName: "",
    role: "user" as UserRole,
    status: "active" as "active" | "disabled",
    password: "",
  });
  const [deleteUser, setDeleteUser] = useState<SysUser | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tip, setTip] = useState("");

  async function load() {
    const res = await fetch("/api/users");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "加载失败");
    setUsers(json.data || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  async function onCreate() {
    if (!isCnMobile(form.phone)) {
      setError("手机号格式不正确（需为11位中国大陆手机号）");
      return;
    }
    setBusy("create");
    setError("");
    setTip("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "创建失败");
      setForm(emptyForm);
      setCreateOpen(false);
      setTip(`已创建用户 ${json.data.phone}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy("");
    }
  }

  function startEdit(u: SysUser) {
    setEditUser(u);
    setEdit({
      phone: u.phone,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      password: "",
    });
  }

  async function onSaveEdit() {
    if (!editUser) return;
    if (!isCnMobile(edit.phone)) {
      setError("手机号格式不正确（需为11位中国大陆手机号）");
      return;
    }
    setBusy("edit");
    setError("");
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: edit.phone,
          displayName: edit.displayName,
          role: edit.role,
          status: edit.status,
          password: edit.password || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存失败");
      setEditUser(null);
      setTip("用户已更新");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function onDeleteConfirm() {
    if (!deleteUser) return;
    setBusy("del");
    setError("");
    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "删除失败");
      setTip(`已删除 ${deleteUser.phone}`);
      setDeleteUser(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4 h-[calc(100vh-110px)] flex flex-col">
      <div className="rounded-2xl bg-white shadow-card px-5 py-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-bold text-lg text-[#1a4b7a]">用户管理</h2>
          <p className="text-sm text-[#7b8da0] mt-1">
            管理员可通过弹窗创建、编辑、禁用与删除账号
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
          新增用户
        </Button>
      </div>

      {tip ? (
        <div className="rounded-xl border border-[#cfe0f5] bg-[#eef6fe] px-4 py-2 text-sm text-[#1a4b7a]">
          {tip}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 rounded-2xl bg-white shadow-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#f5f9fd] text-[#1a4b7a]">
            <tr>
              <th className="text-left p-3">手机号</th>
              <th className="text-left p-3">显示名</th>
              <th className="text-left p-3">角色</th>
              <th className="text-left p-3">状态</th>
              <th className="text-left p-3">更新时间</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[#eef2f7]">
                <td className="p-3 font-mono">{u.phone}</td>
                <td className="p-3">{u.displayName}</td>
                <td className="p-3">
                  {u.role === "admin" ? (
                    <span className="rounded bg-[#eef6fe] text-[#1a4b7a] px-2 py-0.5 text-xs">
                      管理员
                    </span>
                  ) : (
                    <span className="rounded bg-[#f3f4f6] text-[#64748b] px-2 py-0.5 text-xs">
                      普通用户
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {u.status === "active" ? (
                    <span className="text-emerald-600">启用</span>
                  ) : (
                    <span className="text-rose-600">禁用</span>
                  )}
                </td>
                <td className="p-3 text-[#7b8da0]">
                  {formatDateTime(u.updatedAt)}
                </td>
                <td className="p-3 space-x-3">
                  <button className="text-[#4a9eff]" onClick={() => startEdit(u)}>
                    编辑
                  </button>
                  <button
                    className="text-rose-600"
                    onClick={() => setDeleteUser(u)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={createOpen}
        title="新增用户"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={!!busy} onClick={onCreate}>
              {busy === "create" ? "创建中…" : "创建"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label="手机号"
            inputMode="numeric"
            maxLength={11}
            value={form.phone}
            placeholder="11位手机号"
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value.replace(/\D/g, "").slice(0, 11),
              })
            }
          />
          <Field
            label="显示名"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
          <Field
            label="密码"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            label="角色"
            value={form.role}
            options={[
              { value: "user", label: "普通用户" },
              { value: "admin", label: "管理员" },
            ]}
            onChange={(v) => setForm({ ...form, role: v as UserRole })}
          />
        </div>
      </Modal>

      <Modal
        open={!!editUser}
        title={`编辑用户 · ${editUser?.phone || ""}`}
        onClose={() => setEditUser(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)}>
              取消
            </Button>
            <Button disabled={!!busy} onClick={onSaveEdit}>
              {busy === "edit" ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label="手机号"
            inputMode="numeric"
            maxLength={11}
            value={edit.phone}
            onChange={(e) =>
              setEdit({
                ...edit,
                phone: e.target.value.replace(/\D/g, "").slice(0, 11),
              })
            }
          />
          <Field
            label="显示名"
            value={edit.displayName}
            onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
          />
          <Select
            label="角色"
            value={edit.role}
            options={[
              { value: "user", label: "普通用户" },
              { value: "admin", label: "管理员" },
            ]}
            onChange={(v) => setEdit({ ...edit, role: v as UserRole })}
          />
          <Select
            label="状态"
            value={edit.status}
            options={[
              { value: "active", label: "启用" },
              { value: "disabled", label: "禁用" },
            ]}
            onChange={(v) =>
              setEdit({ ...edit, status: v as "active" | "disabled" })
            }
          />
          <Field
            label="新密码（可选）"
            type="password"
            value={edit.password}
            placeholder="留空则不修改"
            onChange={(e) => setEdit({ ...edit, password: e.target.value })}
          />
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteUser}
        title="删除用户"
        message={`确认删除用户「${deleteUser?.phone || ""}」？此操作不可恢复。`}
        confirmText="删除"
        danger
        busy={busy === "del"}
        onClose={() => setDeleteUser(null)}
        onConfirm={onDeleteConfirm}
      />
    </div>
  );
}
