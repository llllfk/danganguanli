"use client";

import { TalentNav } from "@/components/talent/TalentNav";

const ROWS = [
  { post: "综合管理岗", score: 92, reason: "履历完整 · 考核优秀" },
  { post: "专业技术岗", score: 84, reason: "职称匹配 · 培训充分" },
  { post: "党建工作岗", score: 78, reason: "党团材料齐全" },
];

export default function MatchPage() {
  return (
    <div className="h-[calc(100vh-110px)] overflow-auto">
      <TalentNav />
      <div className="rounded-2xl bg-white shadow-card p-5">
        <h2 className="text-lg font-bold mb-4 anim-fade-up">人岗匹配</h2>
        <div className="space-y-3">
          {ROWS.map((r, i) => (
            <div
              key={r.post}
              className="rounded-2xl border border-[#ddeafb] p-4 anim-fade-up"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[#1f2d42]">{r.post}</div>
                <div className="text-[#4a9eff] font-bold text-xl anim-pulse-soft">
                  {r.score}
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-[#eaf1f8] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#2f9bff] transition-all"
                  style={{ width: `${r.score}%` }}
                />
              </div>
              <div className="text-sm text-[#7b8da0] mt-2">{r.reason}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
