"use client";

import { useMemo, useState } from "react";
import type { TimePoint } from "../_lib/dashboard";
import { formatCompactUsd, formatDate, formatUsd } from "../_lib/format";

// Lightweight dependency-free donations chart. Renders the cumulative USD
// raised as a smooth sage area, with per-day volume as faint bars underneath
// and an interactive hover crosshair. Mirrors the GainForest donations view's
// "Donation Volume Over Time" panel without pulling in Recharts.

const W = 720;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

export function DonationsChart({ data }: { data: TimePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => {
    // Build a cumulative series across the observed date range.
    let cum = 0;
    const points = data.map((d) => {
      cum += d.amount;
      return { date: d.date, amount: d.amount, count: d.count, cumulative: cum };
    });
    return points;
  }, [data]);

  if (series.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-border-soft bg-surface text-[14px] italic text-foreground/50">
        No donation history yet.
      </div>
    );
  }

  const maxCum = Math.max(...series.map((p) => p.cumulative), 1);
  const maxAmt = Math.max(...series.map((p) => p.amount), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = series.length;

  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yCum = (v: number) => PAD.top + innerH - (v / maxCum) * innerH;
  const yBarH = (v: number) => (v / maxAmt) * (innerH * 0.5);

  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yCum(p.cumulative).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  const active = hover != null ? series[hover] : series[n - 1];
  const firstDate = series[0]?.date;
  const lastDate = series[n - 1]?.date;

  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-foreground/50">
            {hover != null ? "On " + formatDate(active.date) : "Total raised to date"}
          </div>
          <div className="mt-1 font-garamond text-[30px] leading-none text-foreground sm:text-[36px]">
            {formatCompactUsd(hover != null ? active.cumulative : maxCum)}
          </div>
        </div>
        {hover != null && (
          <div className="text-right text-[12.5px] text-foreground/60">
            <div className="text-foreground">{formatUsd(active.amount)} that day</div>
            <div>
              {active.count} donation{active.count === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Cumulative donations over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const rel = (px - PAD.left) / innerW;
          const idx = Math.round(rel * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* per-day volume bars */}
        {series.map((p, i) => {
          const h = yBarH(p.amount);
          if (h < 0.5) return null;
          const bw = Math.max(1.2, (innerW / n) * 0.5);
          return (
            <rect
              key={p.date}
              x={x(i) - bw / 2}
              y={PAD.top + innerH - h}
              width={bw}
              height={h}
              rx={Math.min(bw / 2, 1.5)}
              fill="var(--brand)"
              opacity={hover === i ? 0.55 : 0.2}
            />
          );
        })}

        {/* cumulative area + line */}
        <path d={areaPath} fill="url(#cumFill)" />
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* hover crosshair */}
        {hover != null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--foreground)"
              strokeOpacity="0.18"
              strokeWidth="1"
            />
            <circle cx={x(hover)} cy={yCum(active.cumulative)} r="4" fill="var(--primary)" stroke="var(--background)" strokeWidth="2" />
          </>
        )}
      </svg>

      <div className="flex justify-between px-1 text-[11px] text-foreground/45">
        <span>{firstDate ? formatDate(firstDate) : ""}</span>
        <span>{lastDate ? formatDate(lastDate) : ""}</span>
      </div>
    </div>
  );
}
