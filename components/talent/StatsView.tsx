"use client";

import {
  AgeBarChart,
  ChartCard,
  EduDonutChart,
  MajorBarChart,
  RankBarChart,
} from "./charts";
import { TalentShell } from "./TalentShell";
import { talentCharts } from "@/lib/talent-demo";

export function StatsView() {
  return (
    <TalentShell title="人才分析">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 anim-stagger">
        <ChartCard title="年龄结构（区间・人数）">
          <AgeBarChart data={talentCharts.age} />
        </ChartCard>
        <ChartCard title="职称结构（级别・人数）">
          <RankBarChart data={talentCharts.rank} />
        </ChartCard>
        <ChartCard title="学历结构（学历・人数・占比）">
          <EduDonutChart data={talentCharts.edu} />
        </ChartCard>
        <ChartCard title="专业结构（类别・人数）">
          <MajorBarChart data={talentCharts.major} />
        </ChartCard>
      </div>
    </TalentShell>
  );
}
