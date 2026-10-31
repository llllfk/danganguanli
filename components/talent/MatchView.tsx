"use client";

import { useMemo, useState } from "react";
import { PanelTitle } from "./charts";
import { TalentShell } from "./TalentShell";
import { talentMatch } from "@/lib/talent-demo";

export function MatchView() {
  const board = talentMatch;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(board.departments.map((d) => [d.name, !!d.expanded]))
  );
  const [personCode, setPersonCode] = useState("20631");
  const [postKey, setPostKey] = useState("专业技术岗（生产部门）");

  const postOptions = useMemo(() => {
    const fromTree = board.departments.flatMap((d) =>
      d.posts.map((p) => `${p.name}（${d.name}）`)
    );
    const fromVerify = board.verifyRows.map((r) =>
      r.deptName ? `${r.postName}（${r.deptName}）` : r.postName
    );
    return Array.from(new Set([...fromTree, ...fromVerify]));
  }, [board]);

  const showVerify =
    personCode === "20631" && postKey.includes("专业技术岗");

  const toneBg = {
    blue: "bg-[#e8f2fd] text-[#3D7EDB]",
    green: "bg-[#e8f6ee] text-[#1f9d57]",
    orange: "bg-[#f4efe9] text-[#c08552]",
  };

  return (
    <TalentShell title="人岗匹配">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 anim-stagger">
        {board.summary.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[#d4e3f5] bg-white px-5 py-4 shadow-sm flex items-center gap-4"
          >
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold ${toneBg[s.tone]}`}
            >
              {s.label.slice(0, 1)}
            </div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-[#1f2d42] anim-count-pop">
                {s.value}
              </div>
              <div className="text-sm text-[#5b6b7f]">{s.label}</div>
            </div>
            <div className="text-xs text-[#8a9bb0]">{s.tip}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 anim-fade-up min-h-[480px]">
        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 overflow-auto">
          <PanelTitle>岗位一览（按部门）</PanelTitle>
          <div className="mt-2 grid grid-cols-[1.2fr_1.4fr] bg-[#f1f6fc] text-[#5b6b7f] text-xs font-bold px-3 py-2 rounded-t">
            <span>部门 / 岗位</span>
            <span>任职资格硬性条件</span>
          </div>
          <div className="border border-t-0 border-[#eef3f9] rounded-b overflow-hidden">
            {board.departments.map((dept) => {
              const open = expanded[dept.name];
              return (
                <div key={dept.name}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#f7fafd] text-left hover:bg-[#eef6fe]"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [dept.name]: !prev[dept.name],
                      }))
                    }
                  >
                    <span className="text-[#8a9bb0] text-xs w-3">
                      {dept.posts.length ? (open ? "▼" : "▶") : "▶"}
                    </span>
                    <span className="font-semibold text-[#1f2937] text-sm">
                      {dept.name}
                    </span>
                    <span className="ml-auto rounded-full bg-[#e8f2fd] text-[#3D7EDB] text-xs px-2 py-0.5">
                      {dept.count}
                    </span>
                  </button>
                  {open && dept.posts.length
                    ? dept.posts.map((p, i) => (
                        <div
                          key={p.name}
                          className={`grid grid-cols-[1.2fr_1.4fr] px-3 py-2.5 text-sm border-t border-[#eef3f9] ${
                            i % 2 ? "bg-[#f8fbff]" : "bg-white"
                          }`}
                        >
                          <span className="pl-6 text-[#1f2937]">{p.name}</span>
                          <span className="text-[#64748b] text-[13px]">
                            {p.req}
                          </span>
                        </div>
                      ))
                    : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4">
          <PanelTitle>任职条件核验</PanelTitle>
          <div className="h-px bg-[#9AA7B4]/30 my-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <label className="block">
              <select
                className="w-full rounded-lg border border-[#b6d4f5] bg-[#f7fafd] px-3 py-2.5 text-sm text-[#1f2937]"
                value={postKey}
                onChange={(e) => setPostKey(e.target.value)}
              >
                {postOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <span className="block text-right text-xs text-[#8a9bb0] mt-1">
                选择岗位
              </span>
            </label>
            <label className="block">
              <select
                className="w-full rounded-lg border border-[#b6d4f5] bg-[#f7fafd] px-3 py-2.5 text-sm text-[#1f2937]"
                value={personCode}
                onChange={(e) => setPersonCode(e.target.value)}
              >
                {board.persons.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}（{p.code}）
                  </option>
                ))}
              </select>
              <span className="block text-right text-xs text-[#8a9bb0] mt-1">
                选择人员
              </span>
            </label>
          </div>

          <div className="overflow-auto rounded-lg border border-[#e9f0f7]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f1f6fc] text-[#5b6b7f]">
                  <th className="text-left font-bold px-3 py-2.5">任职条件</th>
                  <th className="text-left font-bold px-3 py-2.5">岗位要求</th>
                  <th className="text-left font-bold px-3 py-2.5">档案记载</th>
                  <th className="text-center font-bold px-3 py-2.5">核验结论</th>
                </tr>
              </thead>
              <tbody>
                {!showVerify ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-[#94a3b8]"
                    >
                      演示数据：请选择「王宇轩 + 专业技术岗」查看核验
                    </td>
                  </tr>
                ) : (
                  board.verifyRows.map((r) => (
                    <tr key={r.item} className="border-t border-[#e9f0f7]">
                      <td className="px-3 py-3.5 text-[#1f2937]">{r.item}</td>
                      <td className="px-3 py-3.5 text-[#1f2937]">{r.require}</td>
                      <td className="px-3 py-3.5 text-[#1f2937]">{r.record}</td>
                      <td className="px-3 py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            r.ok
                              ? "bg-[#e8f6ee] text-[#1f9d57]"
                              : "bg-[#fdecea] text-[#e5494d]"
                          }`}
                        >
                          {r.ok ? "符合" : "不符合"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {showVerify && board.scores.length ? (
            <ul className="mt-4 space-y-2">
              {board.scores.map((r) => (
                <li
                  key={r.post}
                  className="flex items-center justify-between rounded-lg bg-[#eef6fe] px-3 py-2 text-sm"
                >
                  <span>
                    {r.post}
                    <span className="text-[#7b8da0] ml-2 text-xs">
                      {r.reason}
                    </span>
                  </span>
                  <span className="font-bold text-[#4a9eff] anim-count-pop">
                    {r.score}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </TalentShell>
  );
}
