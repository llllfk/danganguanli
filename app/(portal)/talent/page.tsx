"use client";

import { TalentNav } from "@/components/talent/TalentNav";

const CARDS = [
  { title: "在库人才", value: "1,286", tip: "较上月 +12" },
  { title: "高潜干部", value: "86", tip: "画像完备率 92%" },
  { title: "人岗匹配待办", value: "23", tip: "本周新增 5" },
  { title: "临期节点", value: "17", tip: "30日内到期" },
];

export default function TalentHomePage() {
  return (
    <div className="h-[calc(100vh-110px)] overflow-auto">
      <TalentNav />
      <div className="rounded-2xl bg-white shadow-card p-5">
        <h2 className="text-lg font-bold mb-1 anim-fade-up">人才综合分析</h2>
        <p className="text-sm text-[#7b8da0] mb-5 anim-fade-up">
          演示界面 · 数据来自参考图示意，无后端业务逻辑
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {CARDS.map((c, i) => (
            <div
              key={c.title}
              className="rounded-2xl border border-[#ddeafb] bg-gradient-to-br from-[#f7fbff] to-white p-4 anim-fade-up anim-float"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="text-sm text-[#7b8da0]">{c.title}</div>
              <div className="text-3xl font-bold text-[#1a4b7a] mt-2 anim-pulse-soft">
                {c.value}
              </div>
              <div className="text-xs text-[#4a9eff] mt-2">{c.tip}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 h-56 rounded-2xl bg-[#eaf1f8] border border-dashed border-[#cfe0f5] flex items-center justify-center text-[#7b8da0] anim-fade-up">
          人才结构分布示意区（动效演示）
        </div>
      </div>
    </div>
  );
}
