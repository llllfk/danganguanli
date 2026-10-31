"use client";

export type AgeItem = { label: string; count: number; color: string };
export type RankItem = { label: string; total: number; eligible: number };
export type EduItem = { label: string; count: number; pct: string; color: string };
export type MajorItem = { label: string; count: number };

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-4 w-1 rounded-full bg-[#3D7EDB]" />
      <h3 className="text-sm font-semibold tracking-wide text-[#33445C]">
        {children}
      </h3>
    </div>
  );
}

export function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[#d4e3f5] bg-white p-4 min-h-[280px] flex flex-col ${className}`}
    >
      <PanelTitle>{title}</PanelTitle>
      <div className="h-px bg-[#9AA7B4]/30 mb-3" />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/** 年龄结构：居中对称横条 */
export function AgeBarChart({ data }: { data: AgeItem[] }) {
  if (!data.length) {
    return <EmptyChart />;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex flex-col justify-center gap-4 h-full py-2">
      {data.map((d) => {
        const pct = (d.count / max) * 45;
        return (
          <div key={d.label} className="grid grid-cols-[88px_1fr] items-center gap-2">
            <span className="text-sm font-semibold text-[#3A5068]">{d.label}</span>
            <div className="relative h-9 flex items-center justify-center">
              <div className="absolute inset-x-0 top-1/2 h-px border-t border-dashed border-[#9AA7B4]/50" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-[#D5DCE3]" />
              <div
                className="relative z-[1] h-8 flex items-center justify-center text-white text-xs font-semibold rounded-sm"
                style={{
                  width: `${pct * 2}%`,
                  maxWidth: "92%",
                  background: d.color,
                }}
              >
                {d.count}人
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full min-h-[140px] flex items-center justify-center text-sm text-[#94a3b8]">
      暂无统计数据
    </div>
  );
}

/** 职称结构：分组柱 */
export function RankBarChart({ data }: { data: RankItem[] }) {
  if (!data.length) return <EmptyChart />;
  const max = Math.max(...data.map((d) => Math.max(d.total, d.eligible)), 1);
  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-4 text-xs text-[#4A7FB5] mb-2">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-3 w-3 bg-[#7EB9EE] rounded-sm" />
          总人数
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-3 w-3 bg-[#F0A04B] rounded-sm" />
          其中符合晋升高一级基础条件人数
        </span>
      </div>
      <div className="flex-1 flex items-end gap-3 sm:gap-5 px-1 pb-1 border-b border-l border-[#B8CBDE] min-h-[160px]">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end justify-center gap-0.5 h-[140px]">
              <div className="flex flex-col items-center justify-end h-full w-[42%]">
                <span className="text-[11px] font-semibold text-[#4A7FB5] mb-0.5">
                  {d.total}
                </span>
                <div
                  className="w-full rounded-t-sm bg-gradient-to-b from-[#7EB9EE]/95 to-[#E2F1FD]/20"
                  style={{ height: `${(d.total / max) * 100}%` }}
                />
              </div>
              {d.eligible > 0 ? (
                <div className="flex flex-col items-center justify-end h-full w-[42%]">
                  <span className="text-[11px] font-semibold text-[#4A7FB5] mb-0.5">
                    {d.eligible}
                  </span>
                  <div
                    className="w-full rounded-t-sm bg-gradient-to-b from-[#F2A65C]/95 to-[#F7CE9B]/30"
                    style={{ height: `${(d.eligible / max) * 100}%` }}
                  />
                </div>
              ) : null}
            </div>
            <span className="text-xs font-semibold text-[#6A93B8] truncate w-full text-center">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 学历结构：环图（conic-gradient） */
export function EduDonutChart({
  data,
  total,
}: {
  data: EduItem[];
  total?: number;
}) {
  if (!data.length) return <EmptyChart />;
  const sum = (total ?? data.reduce((s, d) => s + d.count, 0)) || 1;
  let acc = 0;
  const stops = data
    .map((d) => {
      const start = acc;
      const share = (d.count / sum) * 100;
      acc += share;
      return `${d.color} ${start}% ${acc}%`;
    })
    .join(", ");

  return (
    <div className="h-full flex flex-col sm:flex-row items-center gap-6 py-2">
      <div
        className="relative shrink-0 h-40 w-40 rounded-full"
        style={{
          background: `conic-gradient(${stops})`,
        }}
      >
        <div className="absolute inset-[28%] rounded-full bg-white flex flex-col items-center justify-center">
          <div className="text-3xl font-semibold text-[#3A5068] leading-none">
            {sum}
          </div>
          <div className="text-xs text-[#9FB6CF] mt-1">总人数</div>
        </div>
      </div>
      <ul className="space-y-2 text-sm w-full max-w-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <i
              className="h-3.5 w-3.5 rounded-sm shrink-0"
              style={{ background: d.color }}
            />
            <span className="text-[#3A5068] w-14">{d.label}</span>
            <span className="text-[#5E7D9E]">
              {d.count}人 {d.pct}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 专业结构：竖柱（柱与标签同列，默认不出现多余滚动条） */
export function MajorBarChart({ data }: { data: MajorItem[] }) {
  if (!data.length) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="h-full min-h-[220px] overflow-hidden">
      <div className="flex items-stretch gap-0.5 border-b border-l border-[#6BA8E5]/65 px-0.5 h-[210px] w-full">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex flex-col items-center flex-1 min-w-0 h-full"
          >
            <div className="flex-1 w-full flex flex-col items-center justify-end pb-1 min-h-0">
              <span className="text-[10px] text-[#9FB6CF] mb-0.5 tabular-nums">
                {d.count}
              </span>
              <div
                className="w-[58%] max-w-[22px] rounded-t-sm bg-gradient-to-b from-[#6BA8E5]/90 to-[#6BA8E5]/10"
                style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
              />
            </div>
            <div className="h-[52px] shrink-0 w-full relative overflow-hidden">
              <span
                className="absolute left-1/2 top-1 text-[9px] text-[#A8BFD6] whitespace-nowrap"
                style={{
                  transform: "translateX(-20%) rotate(-32deg)",
                  transformOrigin: "top left",
                }}
                title={d.label}
              >
                {d.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TREND_Y: Record<string, number> = {
  优秀: 12,
  称职: 42,
  合格: 72,
  不合格: 92,
  待归档: 12,
};

export function AssessmentTrend({
  points,
}: {
  points: { year: string; level: keyof typeof TREND_Y | string }[];
}) {
  const w = 320;
  const h = 140;
  const padX = 40;
  const step = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padX + i * step,
    y: TREND_Y[p.level] ?? 50,
    ...p,
  }));
  const solid = coords.filter((c) => c.level !== "待归档");
  const pending = coords.find((c) => c.level === "待归档");
  const lastSolid = solid[solid.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[160px]" role="img">
      {["优秀", "称职", "合格", "不合格"].map((lab, i) => {
        const y = [12, 42, 72, 92][i];
        return (
          <g key={lab}>
            <line
              x1={padX}
              y1={y}
              x2={w - 16}
              y2={y}
              stroke="#eef2f6"
              strokeWidth="1"
            />
            <text
              x={padX - 6}
              y={y + 4}
              textAnchor="end"
              fill="#64748b"
              fontSize="10"
            >
              {lab}
            </text>
          </g>
        );
      })}
      {solid.length > 1 ? (
        <polyline
          fill="none"
          stroke="#1f9d57"
          strokeWidth="2.5"
          points={solid.map((c) => `${c.x},${c.y}`).join(" ")}
        />
      ) : null}
      {pending && lastSolid ? (
        <line
          x1={lastSolid.x}
          y1={lastSolid.y}
          x2={pending.x}
          y2={pending.y}
          stroke="#9aa7b4"
          strokeWidth="2.5"
          strokeDasharray="7 5"
        />
      ) : null}
      {coords.map((c) => (
        <g key={c.year}>
          <circle
            cx={c.x}
            cy={c.y}
            r="5"
            fill={c.level === "待归档" ? "none" : c.level === "优秀" ? "#1f9d57" : "#5b9bd5"}
            stroke={c.level === "待归档" ? "#9aa7b4" : "none"}
            strokeWidth="2"
          />
          <text
            x={c.x}
            y={c.y - 10}
            textAnchor="middle"
            fill={c.level === "待归档" ? "#8a9bb0" : "#33445C"}
            fontSize="10"
          >
            {c.level}
          </text>
          <text
            x={c.x}
            y={h - 6}
            textAnchor="middle"
            fill="#475569"
            fontSize="10"
          >
            {c.year}
          </text>
        </g>
      ))}
    </svg>
  );
}
