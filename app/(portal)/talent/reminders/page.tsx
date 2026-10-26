"use client";

import { useState } from "react";
import { TalentNav } from "@/components/talent/TalentNav";

/**
 * 节点提醒：退休/试用期满/合同到期可手动改日期，
 * 样式做成“像从档案提取”的只读感，便于演示前微调。
 */
export default function RemindersPage() {
  const [retire, setRetire] = useState("2042-05-12");
  const [probation, setProbation] = useState("2011-01-01");
  const [contract, setContract] = useState("2027-07-01");

  const fields = [
    { key: "retire", label: "退休时间", value: retire, set: setRetire },
    {
      key: "probation",
      label: "试用期满时间",
      value: probation,
      set: setProbation,
    },
    { key: "contract", label: "合同到期时间", value: contract, set: setContract },
  ] as const;

  return (
    <div className="h-[calc(100vh-110px)] overflow-auto">
      <TalentNav />
      <div className="rounded-2xl bg-white shadow-card p-5">
        <h2 className="text-lg font-bold mb-1 anim-fade-up">节点提醒</h2>
        <p className="text-sm text-[#7b8da0] mb-5 anim-fade-up">
          关键时间节点示意 · 下面三项可点击微调（演示假编辑）
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {fields.map((f, i) => (
            <label
              key={f.key}
              className="rounded-2xl border border-[#e4ebf3] bg-[#f7fbff] p-4 block anim-fade-up anim-float"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="text-xs text-[#7b8da0] mb-2">档案提取 · {f.label}</div>
              <input
                type="date"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="w-full bg-transparent text-xl font-bold text-[#1a4b7a] outline-none border-b border-transparent focus:border-[#4a9eff] cursor-text"
              />
            </label>
          ))}
        </div>

        <div className="rounded-2xl border border-[#ddeafb] p-4 anim-fade-up">
          <h3 className="font-semibold mb-3">近30日提醒列表</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between rounded-xl bg-[#eef6fe] px-3 py-2">
              <span>合同到期 · 张三</span>
              <span className="text-[#4a9eff]">{contract}</span>
            </li>
            <li className="flex justify-between rounded-xl bg-[#f8fafc] px-3 py-2">
              <span>试用期满 · 李四（示意）</span>
              <span className="text-[#7b8da0]">2026-11-01</span>
            </li>
            <li className="flex justify-between rounded-xl bg-[#f8fafc] px-3 py-2">
              <span>退休临近 · 王五（示意）</span>
              <span className="text-[#7b8da0]">2026-12-15</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
