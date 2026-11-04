"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Person = { personCode: string; personName: string; pendingFiles: number };
type Deletion = { personCode: string; personName: string; total: number; filesDeleted: number; filesPending: number };

export function DeletePersonModal({ open, initialCode, onClose, onDeleted }: {
  open: boolean;
  initialCode?: string;
  onClose: () => void;
  onDeleted: (result: Deletion) => void;
}) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setNotice("");
    setConfirmed(false);
    setSearch("");
    setCode("");
    fetch("/api/archive/clear-person", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || json.error) throw new Error(json.error || "加载人员失败");
        if (!active) return;
        const list = (json.data || []) as Person[];
        setPersons(list);
        setCode(list.some((person) => person.personCode === initialCode) ? initialCode! : "");
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "加载人员失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Snapshot the selected person when opening; deletion can clear the parent's current code.
  }, [open]);
  const filtered = useMemo(() => persons.filter((person) =>
    `${person.personName} ${person.personCode}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [persons, search]);
  const selected = persons.find((person) => person.personCode === code);

  async function removePerson() {
    if (!selected || !confirmed || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/archive/clear-person", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personCode: selected.personCode }),
      });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(json.error || "删除失败");
      const result = json.data as Deletion;
      onDeleted(result);
      setConfirmed(false);
      if (result.filesPending) {
        setPersons((list) => list.map((p) => p.personCode === code
          ? { ...p, personName: "文件待清理", pendingFiles: result.filesPending } : p));
        setNotice(`人员信息已删除，还有 ${result.filesPending} 个上传文件未清理完成，请重试。`);
      } else {
        setPersons((list) => list.filter((p) => p.personCode !== code));
        setCode("");
        setNotice(`已删除 ${result.personName}（${result.personCode}）的全部人员信息及上传文件。`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} title="删除人员全部信息" onClose={() => { if (!deleting) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={deleting} onClick={onClose}>关闭</Button>
        <Button variant="danger" disabled={loading || deleting || !selected || !confirmed} onClick={() => void removePerson()}>
          {deleting ? "删除中…" : selected?.pendingFiles ? "删除并重试文件清理" : "确认删除该人员"}
        </Button>
      </>}>
      <div className="space-y-4 text-sm">
        <p className="text-[#5b6b7c]">按姓名或人员代码选择任意已入库人员。</p>
        <input aria-label="搜索待删除人员" value={search} disabled={deleting || loading}
          onChange={(e) => { setSearch(e.target.value); setCode(""); setConfirmed(false); }}
          placeholder="输入姓名或人员代码" className="h-10 w-full rounded-lg border border-[#c5daf5] px-3" />
        <select aria-label="选择待删除人员" value={code} disabled={loading || deleting}
          onChange={(e) => { setCode(e.target.value); setConfirmed(false); }}
          className="h-10 w-full rounded-lg border border-[#c5daf5] bg-white px-3">
          <option value="">{loading ? "加载中…" : "请选择人员"}</option>
          {filtered.map((person) => <option key={person.personCode} value={person.personCode}>
            {person.personCode} · {person.personName}{person.pendingFiles ? `（${person.pendingFiles} 个文件待清理）` : ""}
          </option>)}
        </select>
        {!loading && filtered.length === 0 ? <p className="text-[#7b8da0]">没有匹配的人员。</p> : null}
        {selected ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 leading-7">
          将删除 <strong>{selected.personName}（{selected.personCode}）</strong> 的人员主档、整编和审核材料、核验记录、识别缓存、关联人才数据及上传的扫描件。删除后无法恢复。
          <label className="mt-2 flex items-start gap-2 font-medium">
            <input type="checkbox" checked={confirmed} disabled={deleting} className="mt-2"
              onChange={(e) => setConfirmed(e.target.checked)} />
            我确认删除以上人员的全部信息
          </label>
        </div> : null}
        {notice ? <p role="status" className="text-[#2f6fc0]">{notice}</p> : null}
        {error ? <p role="alert" className="text-rose-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
