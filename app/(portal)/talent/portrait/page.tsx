"use client";

import { TalentNav } from "@/components/talent/TalentNav";

const TAGS = ["管理骨干", "理工背景", "党员", "中级职称", "英语良好"];

export default function PortraitPage() {
  return (
    <div className="h-[calc(100vh-110px)] overflow-auto">
      <TalentNav />
      <div className="rounded-2xl bg-white shadow-card p-5 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="anim-fade-up">
          <div className="h-40 rounded-2xl bg-gradient-to-b from-[#4a9eff] to-[#1f5ea0] text-white flex flex-col items-center justify-center anim-float">
            <div className="text-2xl font-bold">张三</div>
            <div className="text-sm opacity-90 mt-1">00001 · 科员</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TAGS.map((t, i) => (
              <span
                key={t}
                className="rounded-full bg-[#eef6fe] text-[#1a4b7a] text-xs px-3 py-1 anim-fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {["能力雷达", "经历时间轴", "培训与考核"].map((title, i) => (
            <div
              key={title}
              className="rounded-2xl border border-[#e4ebf3] p-4 h-36 flex items-center justify-center text-[#7b8da0] anim-fade-up"
              style={{ animationDelay: `${0.1 + i * 0.1}s` }}
            >
              {title}示意（演示动效）
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
