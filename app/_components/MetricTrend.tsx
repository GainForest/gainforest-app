"use client";

import { Maximize2Icon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { MetricSeries } from "../_lib/trends";
import { formatCompact, formatCompactUsd, formatDate } from "../_lib/format";

/** Serializable formatter key — functions can't cross the server→client boundary. */
export type FormatKey = "number" | "usd";
const FORMATTERS: Record<FormatKey, (n: number) => string> = {
  number: (n) => formatCompact(n),
  usd: (n) => formatCompactUsd(n),
};

// Inline sparkline + expand-to-full chart modal for the hero KPI band, in the
// editorial design language (sage `--primary` line, cream `--surface` panel,
// Cormorant headline). All colors are CSS vars so the chart follows the
// light/dark theme automatically.

const LINE = "var(--primary)";

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

/** Chart baseline: "zero" anchors the y-axis at 0 (default); "min" frames it
 *  to the data range so a near-the-top tail (e.g. a recent cumulative slice of
 *  a 400k metric) shows its slope instead of flattening against the top. */
export type Baseline = "zero" | "min";

function sparkPaths(values: number[], vw: number, vh: number, baseline: Baseline = "zero") {
  const n = values.length;
  const maxY = Math.max(1, ...values);
  const minY = baseline === "min" ? Math.min(...values) : 0;
  const range = maxY - minY || 1;
  const x = (i: number) => (i / (n - 1)) * vw;
  const y = (v: number) => vh - ((v - minY) / range) * vh;
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${vw},${vh} L0,${vh} Z`;
  return { line, area };
}

export function Sparkline({
  values,
  className = "",
  baseline = "zero",
}: {
  values: number[];
  className?: string;
  baseline?: Baseline;
}) {
  const VW = 100;
  const VH = 32;
  const { line, area } = sparkPaths(values, VW, VH, baseline);
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={area} fill={LINE} opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke={LINE}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Full chart modal
// ---------------------------------------------------------------------------

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const axisFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Nice rounded [lo, hi] + step framing the [min, max] data range. */
function niceBounds(min: number, max: number): { lo: number; hi: number; step: number } {
  const step = Math.max(1, niceMax((max - min) / 4));
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

function MetricModal({
  title,
  sub,
  series,
  format,
  valueLabel,
  baseline = "zero",
  onClose,
}: {
  title: string;
  sub?: string;
  series: MetricSeries;
  format: (n: number) => string;
  /** Headline number override so the modal matches the card's displayed value
   *  (e.g. windowed/compact metrics where the last point differs). */
  valueLabel?: string;
  baseline?: Baseline;
  onClose: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose]);

  const { days, values } = series;
  const n = values.length;
  const VW = 720;
  const VH = 320;
  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const iw = VW - pad.left - pad.right;
  const ih = VH - pad.top - pad.bottom;
  const dataMin = Math.min(...values);
  const dataMax = Math.max(1, ...values);
  const framed = baseline === "min" && dataMin > 0;
  const bounds = framed ? niceBounds(dataMin, dataMax) : { lo: 0, hi: niceMax(dataMax), step: niceMax(dataMax) / 4 };
  const yMin = bounds.lo;
  const yMax = bounds.hi;
  const span = yMax - yMin || 1;
  const x = (i: number) => pad.left + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.top + ih - ((v - yMin) / span) * ih;
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${(pad.top + ih).toFixed(1)} L${x(0).toFixed(
    1,
  )},${(pad.top + ih).toFixed(1)} Z`;

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 0.5; v += bounds.step) yTicks.push(Math.round(v));

  const idxs = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const focus = hover != null ? { i: hover, v: values[hover], d: days[hover] } : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} trend`}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-border-soft bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-garamond text-[26px] font-normal leading-tight tracking-[-0.01em] text-foreground">
              {title}
            </h3>
            <div className="mt-1 text-[13.5px] text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {valueLabel ?? format(values[n - 1] ?? 0)}
              </span>
              {days.length > 0 && (
                <span>
                  {" · "}
                  {formatDate(days[0])} → {formatDate(days[n - 1])}
                </span>
              )}
              {sub && <span> · {sub}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
          >
            <XIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="w-full"
          style={{ aspectRatio: `${VW} / ${VH}` }}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={pad.left + iw} y1={y(v)} y2={y(v)} stroke="var(--border-soft)" strokeWidth={1} />
              <text x={pad.left - 10} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
                {axisFmt.format(v)}
              </text>
            </g>
          ))}

          <path d={area} fill={LINE} opacity={0.12} />
          <path d={line} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {idxs.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={VH - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {shortDate(days[i])}
            </text>
          ))}

          {focus && (
            <g>
              <line x1={x(focus.i)} x2={x(focus.i)} y1={pad.top} y2={pad.top + ih} stroke={LINE} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <circle cx={x(focus.i)} cy={y(focus.v)} r={4} fill={LINE} />
            </g>
          )}

          {n > 1 &&
            values.map((_, i) => (
              <rect
                key={i}
                x={x(i) - iw / (n - 1) / 2}
                y={pad.top}
                width={iw / (n - 1)}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
        </svg>

        {focus && (
          <div className="mt-3 text-[13.5px] text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{format(focus.v)}</span>{" "}
            <span>on {formatDate(focus.d)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card — preserves the hero band markup, adds a sparkline + tap-to-expand
// ---------------------------------------------------------------------------

export function KpiCard({
  value,
  label,
  sub,
  series,
  format = "number",
  baseline = "zero",
}: {
  value: string;
  label: string;
  sub: string;
  series?: MetricSeries | null;
  format?: FormatKey;
  baseline?: Baseline;
}) {
  const [open, setOpen] = useState(false);
  const hasSeries = !!series && series.values.length > 1;

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark">Live</span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div
          className={`font-garamond text-[34px] font-normal leading-[0.98] tracking-[-0.015em] text-foreground sm:text-[42px] lg:text-[52px] ${
            hasSeries ? "transition-colors group-hover:text-primary" : ""
          }`}
        >
          {value}
        </div>
        {hasSeries && (
          <Sparkline values={series!.values} baseline={baseline} className="h-9 w-20 shrink-0 self-center" />
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-foreground lg:text-[15px]">
        {label}
        {hasSeries && (
          <Maximize2Icon
            aria-hidden
            className="h-3 w-3 text-foreground/30 transition-colors group-hover:text-primary"
          />
        )}
      </div>
      <div className="text-[12.5px] text-foreground/55">{sub}</div>
    </>
  );

  return (
    <li className="bg-surface p-5 lg:p-7">
      {hasSeries ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Expand ${label} trend`}
          className="group block w-full cursor-pointer text-left outline-none"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {open && hasSeries && (
        <MetricModal
          title={label}
          sub={sub}
          series={series!}
          format={FORMATTERS[format]}
          valueLabel={value}
          baseline={baseline}
          onClose={() => setOpen(false)}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Stat card — the compact band variant (donations dashboard + record pages).
// Same uppercase-label / Cormorant-value / sub markup the stat bands already
// used, now with an inline sparkline + tap-to-expand modal when a series is
// available. Degrades to a plain stat (no button, no chart) when it isn't.
// ---------------------------------------------------------------------------

export function StatCard({
  value,
  label,
  sub,
  series,
  format = "number",
}: {
  value: string;
  label: string;
  sub: string;
  series?: MetricSeries | null;
  format?: FormatKey;
}) {
  const [open, setOpen] = useState(false);
  const hasSeries = !!series && series.values.length > 1;

  const body = (
    <>
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs sm:tracking-[0.16em]">
              {label}
            </span>
            {hasSeries && (
              <Maximize2Icon
                aria-hidden
                className="h-2.5 w-2.5 text-foreground/25 transition-colors group-hover:text-primary"
              />
            )}
          </div>
          <div
            className={`mt-1 text-2xl font-semibold tracking-[-0.02em] tabular-nums text-foreground sm:text-3xl ${
              hasSeries ? "transition-colors group-hover:text-primary" : ""
            }`}
          >
            {value}
          </div>
          <div className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-normal">{sub}</div>
        </div>
        {hasSeries && <Sparkline values={series!.values} className="hidden h-10 w-20 shrink-0 self-center sm:block" />}
      </div>
    </>
  );

  return (
    <li className="group relative overflow-hidden rounded-2xl bg-foreground/5 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-foreground/[0.07] sm:rounded-3xl sm:p-6">
      {hasSeries ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Expand ${label} trend`}
          className="group block w-full cursor-pointer text-left outline-none"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {open && hasSeries && (
        <MetricModal
          title={label}
          sub={sub}
          series={series!}
          format={FORMATTERS[format]}
          valueLabel={value}
          onClose={() => setOpen(false)}
        />
      )}
    </li>
  );
}
