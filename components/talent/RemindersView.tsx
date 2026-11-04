"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { TalentShell } from "./TalentShell";
import { daysUntil, reminderDateLabel } from "@/lib/reminder-date";
import {
  getRemindersWithOverrides,
  saveReminderOverride,
  talentTitlePromo,
  type DemoReminder,
} from "@/lib/talent-demo";

type ReminderItem = {
  id: string;
  name: string;
  code: string;
  date: string;
  label: string;
  daysLeft: number;
};

function ReminderScroll({ children }: { children: React.ReactNode }) {
  return <div className="relative min-h-[185px]">
    <div className="max-h-[230px] overflow-y-auto pr-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
    <div aria-hidden="true" className="absolute right-0 top-0 bottom-0 w-[7px] rounded-full bg-[#edf2f7] pointer-events-none">
      <div className="mt-1 h-14 rounded-full bg-[#b7c7d8]" />
    </div>
  </div>;
}

function DaysBadge({ days }: { days: number }) {
  const urgent = days <= 14;
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
        urgent
          ? "bg-[#fdecea] text-[#e5494d]"
          : "bg-[#fdf1e5] text-[#d97706]"
      }`}
    >
      {reminderDateLabel(days)}
    </span>
  );
}

function ReminderList({
  items,
  emptyText,
  onEdit,
}: {
  items: ReminderItem[];
  emptyText: string;
  onEdit: (item: ReminderItem) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-[#e3ebf4] bg-[#fbfcfe] px-4 py-8 text-sm text-[#a3b3c6]">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          title="点击可调整节点日期"
          onClick={() => onEdit(it)}
          className="group w-full text-left rounded-lg border border-[#d4e3f5] bg-[#f7fafd] px-3 py-3 flex flex-wrap items-center gap-3 hover:border-[#4a9eff]/50 transition"
        >
          <span
            className={`h-9 w-9 rounded-full shrink-0 ${
              it.daysLeft <= 14 ? "bg-[#fdecea]" : "bg-[#fdf1e5]"
            }`}
          />
          <span className="font-semibold text-[#1f2937]">{it.name}</span>
          <span className="text-sm text-[#8a9bb0]">{it.code}</span>
          <span className="text-sm text-[#1f2937] ml-auto sm:ml-4">
            {it.label} {it.date}
          </span>
          <DaysBadge days={it.daysLeft} />
          <span className="text-[11px] text-[#94a3b8] opacity-0 group-hover:opacity-100 transition">
            改期
          </span>
        </button>
      ))}
    </div>
  );
}

function toItems(
  rows: DemoReminder[],
  type: DemoReminder["type"],
  nearDays = 120
): ReminderItem[] {
  return rows
    .filter((r) => r.type === type)
    .map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      date: r.date,
      label: r.label,
      daysLeft: daysUntil(r.date),
    }))
    .filter((r) => (type === "contract" || r.daysLeft >= 0) && r.daysLeft <= nearDays);
}

export function RemindersView() {
  const [rows, setRows] = useState<DemoReminder[]>([]);
  const [editing, setEditing] = useState<ReminderItem | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [titleFilter, setTitleFilter] = useState("all");

  useEffect(() => {
    setRows(getRemindersWithOverrides());
  }, []);

  const retire = useMemo(() => toItems(rows, "retire", 90), [rows]);
  const contract = useMemo(() => toItems(rows, "contract", 90), [rows]);
  const probation = useMemo(() => toItems(rows, "probation", 90), [rows]);

  const filteredTitle =
    titleFilter === "ok"
      ? talentTitlePromo.filter((t) => t.ok)
      : titleFilter === "no"
        ? talentTitlePromo.filter((t) => !t.ok)
        : talentTitlePromo;

  const cards = [
    { key: "retire", label: "退休临近", value: retire.length },
    { key: "contract", label: "合同即将到期", value: contract.length },
    { key: "probation", label: "试用期将满", value: probation.length },
    { key: "title", label: "职称晋级", value: 165 },
  ];

  function openEdit(item: ReminderItem) {
    setEditing(item);
    setDateValue(item.date);
  }

  function saveDate() {
    if (!editing || !dateValue) return;
    saveReminderOverride(editing.id, dateValue);
    setRows(getRemindersWithOverrides());
    setEditing(null);
  }

  return (
    <TalentShell title="节点提醒">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4 anim-stagger">
        {cards.map((c) => (
          <div
            key={c.key}
            className="rounded-xl border border-[#d4e3f5] bg-white px-5 py-5 shadow-sm flex items-center justify-between"
          >
            <span className="text-base font-semibold text-[#5b6b7f]">
              {c.label}
            </span>
            <span className="text-3xl font-bold text-[#1f2d42] anim-count-pop">
              {c.value}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 anim-stagger">
        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-4 w-1 rounded-full bg-[#3D7EDB]" />
            <h3 className="text-sm font-semibold tracking-wide text-[#33445C]">
              退休临近
            </h3>
            <span className="ml-auto text-xs text-[#8a9bb0]">提前 2 个月</span>
          </div>
          <div className="h-px bg-[#9AA7B4]/30 mb-3" />
          <ReminderScroll><ReminderList
            items={retire}
            emptyText="近期暂无其他退休节点"
            onEdit={openEdit}
          /></ReminderScroll>
        </section>

        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-4 w-1 rounded-full bg-[#3D7EDB]" />
            <h3 className="text-sm font-semibold tracking-wide text-[#33445C]">
              合同即将到期
            </h3>
            <span className="ml-auto text-xs text-[#8a9bb0]">提前 1 个月</span>
          </div>
          <div className="h-px bg-[#9AA7B4]/30 mb-3" />
          <ReminderScroll><ReminderList
            items={contract}
            emptyText="近期暂无合同到期节点"
            onEdit={openEdit}
          /></ReminderScroll>
        </section>

        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-4 w-1 rounded-full bg-[#3D7EDB]" />
            <h3 className="text-sm font-semibold tracking-wide text-[#33445C]">
              试用期将满
            </h3>
            <span className="ml-auto text-xs text-[#8a9bb0]">提前 1 个月</span>
          </div>
          <div className="h-px bg-[#9AA7B4]/30 mb-3" />
          <ReminderScroll><ReminderList
            items={probation}
            emptyText="近期暂无其他试用期满节点"
            onEdit={openEdit}
          /></ReminderScroll>
        </section>

        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 min-h-[260px]">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="h-4 w-1 rounded-full bg-[#3D7EDB]" />
            <h3 className="text-sm font-semibold tracking-wide text-[#33445C]">
              职称晋级资格
            </h3>
            <select
              className="ml-auto text-xs text-[#2f6fc0] rounded-md border border-[#b6d4f5] bg-[#f7fafd] px-2 py-1"
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="ok">已满足</option>
              <option value="no">不满足</option>
            </select>
          </div>
          <div className="h-px bg-[#9AA7B4]/30 mb-3" />
          <ReminderScroll><div className="space-y-2.5">
            {filteredTitle.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-[#d4e3f5] bg-[#f7fafd] px-3 py-3 flex flex-wrap items-center gap-2"
              >
                <span
                  className={`h-9 w-9 rounded-full shrink-0 ${
                    t.ok ? "bg-[#e8f6ee]" : "bg-[#fdecea]"
                  }`}
                />
                <span className="font-semibold text-[#1f2937]">{t.name}</span>
                <span className="text-sm text-[#8a9bb0]">{t.code}</span>
                <span className="text-sm text-[#475569]">{t.meta}</span>
                <span
                  className={`text-sm font-semibold ml-auto ${
                    t.ok ? "text-[#1f9d57]" : "text-[#e5494d]"
                  }`}
                >
                  {t.verdict}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    t.ok
                      ? "bg-[#e8f6ee] text-[#1f9d57]"
                      : "bg-[#fdecea] text-[#e5494d]"
                  }`}
                >
                  {t.ok ? "满足" : "不满足"}
                </span>
              </div>
            ))}
          </div></ReminderScroll>
        </section>
      </div>

      <Modal
        open={!!editing}
        title={`修改节点 · ${editing?.label || ""}`}
        onClose={() => setEditing(null)}
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={saveDate}>保存</Button>
          </>
        }
      >
        <Field
          label={`${editing?.name || ""} · ${editing?.label || "日期"}`}
          type="date"
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
        />
      </Modal>
    </TalentShell>
  );
}
