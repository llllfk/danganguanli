"use client";

import { useMemo, useState } from "react";
import { AssessmentTrend, PanelTitle } from "./charts";
import { TalentShell } from "./TalentShell";
import { talentPortraitWang } from "@/lib/talent-demo";

export function PortraitView() {
  const [input, setInput] = useState("20631");
  const [query, setQuery] = useState("20631");

  const data = useMemo(() => {
    const q = query.trim();
    if (!q || q === "20631" || q === "王宇轩") return talentPortraitWang;
    return null;
  }, [query]);

  const infoRows: [string, string, string, string][] = data
    ? [
        ["性别", data.gender, "民族", data.ethnicity],
        ["出生日期", data.dob, "政治面貌", data.political],
        ["入党时间", data.joinParty, "参加工作时间", data.workStart],
        ["学历", data.education, "学位", data.degree],
        ["职称", data.jobTitle, "现任职务", data.position],
        ["用工层级", data.contractLevel, "档案状态", data.archiveStatus],
      ]
    : [];

  return (
    <TalentShell title="人才画像">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 anim-stagger min-h-[560px]">
        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 flex flex-col">
          <div className="flex gap-2 rounded-lg border border-[#b6d4f5] bg-[#f4f8fd] p-1.5">
            <input
              className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[#94a3b8]"
              placeholder="输入姓名 / 干部代码，查看人才画像"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQuery(input.trim());
              }}
            />
            <button
              type="button"
              className="shrink-0 rounded-md bg-[#4a9eff] px-4 py-1.5 text-sm font-semibold text-white"
              onClick={() => setQuery(input.trim())}
            >
              查询
            </button>
          </div>
          <div className="my-4 h-px bg-[#e4ebf3]" />
          {data ? (
            <>
              <div className="flex flex-col items-center">
                <div className="h-16 w-16 rounded-full bg-gradient-to-b from-[#3d82d0] to-[#1f5ea0] anim-float" />
                <div className="mt-3 text-xl font-semibold text-[#1f2d42]">
                  {data.name}
                </div>
                <div className="text-sm text-[#6b7a8f]">
                  干部代码 {data.personCode}
                </div>
              </div>
              <div className="my-4 h-px bg-[#e4ebf3]" />
              <h4 className="text-base font-semibold text-[#334155] mb-2">
                基本信息
              </h4>
              <div className="rounded-lg border border-[#e4ebf3] bg-[#fbfcfe] overflow-hidden text-sm">
                {infoRows.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 border-b border-[#eef3f9] last:border-0"
                  >
                    <div className="grid grid-cols-[88px_1fr] gap-1 px-3 py-2.5 border-r border-[#eef3f9]">
                      <span className="text-[#64748b]">{row[0]}</span>
                      <span
                        className={
                          row[0] === "档案状态" && row[1] === "已审核"
                            ? "text-[#1f9d57] font-medium"
                            : "text-[#1f2937]"
                        }
                      >
                        {row[1] || "-"}
                      </span>
                    </div>
                    <div className="grid grid-cols-[100px_1fr] gap-1 px-3 py-2.5">
                      <span className="text-[#64748b]">{row[2]}</span>
                      <span
                        className={
                          row[2] === "档案状态" && row[3] === "已审核"
                            ? "text-[#1f9d57] font-medium"
                            : "text-[#1f2937]"
                        }
                      >
                        {row[3] || "-"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {data.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[#eef6fe] text-[#1a4b7a] text-xs px-2.5 py-0.5"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[#7b8da0] text-center py-8">
              演示数据仅含王宇轩（20631）
            </p>
          )}
        </section>

        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 flex flex-col">
          <PanelTitle>任职经历时间线</PanelTitle>
          <div className="h-px bg-[#9AA7B4]/30 mb-4" />
          {data?.timeline?.length ? (
            <div className="relative flex-1 pl-2 overflow-auto max-h-[360px]">
              <div className="absolute left-[72px] top-2 bottom-2 w-0.5 bg-[#cfe0f5]" />
              <ul className="space-y-5">
                {data.timeline.map((item, idx) => (
                  <li
                    key={item.date + idx}
                    className="grid grid-cols-[64px_1fr] gap-3 relative"
                    style={{
                      animation: "fadeUp 0.45s ease both",
                      animationDelay: `${0.08 * idx}s`,
                    }}
                  >
                    <span className="text-right text-sm font-semibold pt-0.5 text-[#4a9eff]">
                      {item.date}
                    </span>
                    <div className="pl-4">
                      <span className="absolute left-[66px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#4a9eff]" />
                      <div className="text-sm font-semibold text-[#1f2937]">
                        {item.text}
                      </div>
                      <div className="text-xs text-[#6b7a8f] mt-0.5">
                        {item.source}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-[#94a3b8] py-6 text-center">暂无任职经历</p>
          )}
          <div className="mt-5">
            <PanelTitle>职称晋升轨迹</PanelTitle>
            <div className="h-px bg-[#9AA7B4]/30 mb-6" />
            {data?.promotion?.length ? (
              <div className="relative mx-4 h-16">
                <div className="absolute left-0 right-0 top-5 h-0.5 bg-[#cfe0f5]" />
                {data.promotion.map((p, i) => (
                  <div
                    key={p.date}
                    className={`absolute top-0 flex flex-col items-center ${
                      i === 0 ? "left-0" : "right-0"
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold mb-1 ${
                        p.pending ? "text-[#9ccde8]" : "text-[#4a9eff]"
                      }`}
                    >
                      {p.date}
                    </span>
                    <span
                      className={`h-3 w-3 rounded-full border-2 border-white ${
                        p.pending
                          ? "bg-transparent border-[#9ccde8] anim-pulse-soft"
                          : "bg-[#4a9eff]"
                      }`}
                    />
                    <span className="text-xs mt-2 text-[#1f2937]">{p.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#94a3b8] text-center">暂无晋升记录</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[#d4e3f5] bg-white p-4 flex flex-col gap-4">
          <div>
            <PanelTitle>考核记录</PanelTitle>
            <div className="h-px bg-[#9AA7B4]/30 mb-2" />
            {data?.assessments?.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f1f6fc] text-[#5b6b7f]">
                    <th className="text-left font-bold px-3 py-2">考核年度</th>
                    <th className="text-center font-bold px-3 py-2">考核结果</th>
                    <th className="text-left font-bold px-3 py-2">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assessments.map((a) => (
                    <tr key={a.year} className="border-b border-[#e9f0f7]">
                      <td className="px-3 py-2.5">{a.year} 年度</td>
                      <td
                        className={`px-3 py-2.5 text-center font-medium ${
                          a.result === "优秀"
                            ? "text-[#1f9d57]"
                            : a.result === "称职"
                              ? "text-[#3b82c4]"
                              : "text-[#94a3b8]"
                        }`}
                      >
                        {a.result || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[#94a3b8]">{a.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[#94a3b8] text-center py-4">暂无考核记录</p>
            )}
          </div>
          <div>
            <PanelTitle>考核趋势</PanelTitle>
            <div className="h-px bg-[#9AA7B4]/30 mb-1" />
            {data?.trend?.length ? (
              <AssessmentTrend points={data.trend} />
            ) : (
              <p className="text-sm text-[#94a3b8] text-center py-4">暂无趋势</p>
            )}
          </div>
          <div>
            <PanelTitle>奖惩记录</PanelTitle>
            <div className="h-px bg-[#9AA7B4]/30 mb-2" />
            {data?.awards?.length ? (
              <div className="rounded-lg border border-[#d4e3f5] bg-[#f7fafd] p-3 space-y-3">
                {data.awards.map((a) => (
                  <div key={a.year + a.title} className="flex gap-2">
                    <span className="mt-1 h-4 w-1.5 rounded bg-[#1f9d57] shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-[#1f2937]">
                        {a.year} 年度 {a.title}
                      </div>
                      <div className="text-xs text-[#6b7a8f]">{a.source}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#94a3b8] text-center py-4">暂无奖惩记录</p>
            )}
          </div>
        </section>
      </div>
    </TalentShell>
  );
}
