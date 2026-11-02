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
      className={`rounded-xl border border-[#d4e3f5] bg-white p-4 min-h-[300px] flex flex-col overflow-visible ${className}`}
    >
      <PanelTitle>{title}</PanelTitle>
      <div className="h-px bg-[#9AA7B4]/30 mb-3" />
      <div className="flex-1 min-h-[220px] overflow-visible">{children}</div>
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

/** 专业结构：柱顶数值 + 柱下竖排类名，避免斜标签交叉 */
export function MajorBarChart({ data }: { data: MajorItem[] }) {
  if (!data.length) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.count), 1);
  const mid = Math.round(max / 2);
  const n = data.length;
  const maxChars = Math.max(...data.map((d) => d.label.length), 1);

  const W = 580;
  const padL = 36;
  const padR = 12;
  const padT = 22;
  const plotH = 140;
  const charH = 12;
  const labelBand = maxChars * charH + 6;
  const H = padT + plotH + 6 + labelBand;
  const plotW = W - padL - padR;
  const baseY = padT + plotH;
  const barSlot = plotW / n;
  const barW = Math.min(16, barSlot * 0.42);

  const yAt = (v: number) => padT + plotH * (1 - v / max);

  return (
    <div className="h-full min-h-[280px] w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full max-h-[300px]"
        role="img"
        aria-label="专业结构"
      >
        {[max, mid, 0].map((v) => {
          const y = yAt(v);
          return (
            <g key={`tick-${v}`}>
              {v > 0 ? (
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#d5e3f2"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              ) : null}
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fill="#8aa0b8"
                fontSize="11"
              >
                {v}
              </text>
            </g>
          );
        })}

        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={baseY}
          stroke="#6BA8E5"
          strokeOpacity="0.65"
          strokeWidth="1"
        />
        <line
          x1={padL}
          y1={baseY}
          x2={W - padR}
          y2={baseY}
          stroke="#6BA8E5"
          strokeOpacity="0.65"
          strokeWidth="1"
        />

        <defs>
          <linearGradient id="major-bar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6BA8E5" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6BA8E5" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {data.map((d, i) => {
          const cx = padL + barSlot * (i + 0.5);
          const barH = Math.max((d.count / max) * (plotH - 4), 3);
          const top = baseY - barH;
          const x = cx - barW / 2;
          const chars = Array.from(d.label);
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={top}
                width={barW}
                height={barH}
                rx={2}
                fill="url(#major-bar-fill)"
              />
              <text
                x={cx}
                y={top - 5}
                textAnchor="middle"
                fill="#7f96b0"
                fontSize="10"
              >
                {d.count}
              </text>
              {chars.map((ch, ci) => (
                <text
                  key={`${d.label}-${ci}`}
                  x={cx}
                  y={baseY + 14 + ci * charH}
                  textAnchor="middle"
                  fill="#8aa0b8"
                  fontSize="10"
                >
                  {ch}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TREND_Y: Record<string, number> = {
  优秀: 18,
  称职: 48,
  合格: 78,
  不合格: 108,
  待归档: 18,
};

export function AssessmentTrend({
  points,
}: {
  points: { year: string; level: keyof typeof TREND_Y | string }[];
}) {
  const w = 320;
  const h = 150;
  const padX = 48;
  const padBottom = 22;
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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[168px]" role="img">
      {["优秀", "称职", "合格", "不合格"].map((lab, i) => {
        const y = [18, 48, 78, 108][i];
        return (
          <g key={lab}>
            <line
              x1={padX}
              y1={y}
              x2={w - 12}
              y2={y}
              stroke="#eef2f6"
              strokeWidth="1"
            />
            <text
              x={padX - 8}
              y={y + 3}
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
            fill={
              c.level === "待归档"
                ? "none"
                : c.level === "优秀"
                  ? "#1f9d57"
                  : "#5b9bd5"
            }
            stroke={c.level === "待归档" ? "#9aa7b4" : "none"}
            strokeWidth="2"
          />
          {c.level !== "待归档" ? (
            <text
              x={c.x}
              y={c.y - 10}
              textAnchor="middle"
              fill="#33445C"
              fontSize="10"
            >
              {c.level}
            </text>
          ) : null}
          <text
            x={c.x}
            y={h - padBottom + 16}
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
