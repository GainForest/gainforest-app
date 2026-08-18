"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AudioPace, AudioSeries } from "./model";

/**
 * Audio uploaded against the pace needed to hit the recording target by the
 * grant's closing date — the chart Bumiscan's Klarna scorecard draws for
 * "Bioacoustic Data Collected", narrowed to one grantee and measured in
 * minutes.
 *
 * The solid line is what has actually been uploaded; the dashed line is the
 * straight run to target the grantee needs to keep. The headline reports the
 * gap between them over the selected period, so "behind" is a number rather
 * than an impression.
 *
 * The window ends at the last day with data, not at the deadline: the point
 * is where the grantee stands today, and drawing months of empty future would
 * flatten the part that matters.
 *
 * Before the grant window opens the chart still draws — Bumiscan tracks the
 * line the whole time. The axis then anchors on the first upload instead of
 * the (future) grant start, the required line lies flat at zero, and the
 * readout calls the balance a head start rather than a pace verdict: nothing
 * is asked of a grantee whose window has not opened.
 */

const DAY_MS = 86_400_000;

const RANGES = [
  { id: "1w", days: 7 },
  { id: "1m", days: 30 },
  { id: "6m", days: 182 },
  { id: "all", days: null },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

/** Cumulative value of the series as of `ms` (0 before the first point). */
function seriesValueAt(series: AudioSeries, ms: number): number {
  let value = 0;
  for (let i = 0; i < series.days.length; i += 1) {
    if (Date.parse(series.days[i]!) <= ms) value = series.values[i]!;
    else break;
  }
  return value;
}

function niceRound(value: number): number {
  if (value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / power;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
}

function niceBounds(min: number, max: number): { lo: number; hi: number; step: number } {
  const step = Math.max(1, niceRound((max - min) / 4));
  const lo = Math.floor(min / step) * step;
  return { lo, hi: Math.max(lo + step, Math.ceil(max / step) * step), step };
}

export function AudioPaceChart({
  series,
  pace,
  grantStart,
  deadline,
  targetMinutes,
  currentMinutes,
}: {
  series: AudioSeries;
  pace: AudioPace;
  /** ISO day the grant clock started for this account. */
  grantStart: string;
  /** ISO date the target must be met by. */
  deadline: string;
  targetMinutes: number;
  currentMinutes: number;
}) {
  const t = useTranslations("marketplace.grants.rewildingDashboard.grant.pace");
  const format = useFormatter();
  const [range, setRange] = useState<RangeId>("all");
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    const startMs = Date.parse(grantStart);
    const endMs = Date.parse(deadline);
    // The pace the whole grant demands: target spread evenly across its days.
    const grantDays = Math.max(1, (endMs - startMs) / DAY_MS);
    const requiredPace = targetMinutes / grantDays;

    const lastMs = Date.parse(series.days[series.days.length - 1]!);
    // Before the window opens the grant start lies beyond the data, so the
    // axis anchors on the eve of the first upload instead: the line rises
    // from zero, and nothing is required of any day it covers.
    const preWindow = startMs > lastMs;
    const floorMs = preWindow ? Date.parse(series.days[0]!) - DAY_MS : startMs;
    const option = RANGES.find((r) => r.id === range)!;
    const windowStartMs =
      option.days == null ? floorMs : Math.max(floorMs, lastMs - (option.days - 1) * DAY_MS);

    const spanDays = Math.max(1, (lastMs - windowStartMs) / DAY_MS);
    const startVal = seriesValueAt(series, windowStartMs);
    const endVal = series.values[series.values.length - 1]!;
    const actualGrowth = endVal - startVal;
    const requiredGrowth = preWindow ? 0 : requiredPace * spanDays;

    const pts: { ms: number; v: number }[] = [{ ms: windowStartMs, v: startVal }];
    for (let i = 0; i < series.days.length; i += 1) {
      const ms = Date.parse(series.days[i]!);
      if (ms > windowStartMs && ms <= lastMs) pts.push({ ms, v: series.values[i]! });
    }
    if (pts[pts.length - 1]!.ms !== lastMs) pts.push({ ms: lastMs, v: endVal });

    return {
      preWindow,
      windowStartMs,
      lastMs,
      startVal,
      endVal,
      actualGrowth,
      requiredGrowth,
      delta: actualGrowth - requiredGrowth,
      requiredPace,
      actualPace: actualGrowth / spanDays,
      pts,
    };
  }, [series, range, targetMinutes, grantStart, deadline]);

  const ahead = view.delta >= 0;
  const preWindow = view.preWindow;

  // Geometry. Same proportions as the Bumiscan chart.
  const VW = 720;
  const VH = 300;
  const pad = { top: 18, right: 18, bottom: 30, left: 58 };
  const iw = VW - pad.left - pad.right;
  const ih = VH - pad.top - pad.bottom;

  const reqEnd = view.startVal + view.requiredGrowth;
  const vals = [...view.pts.map((p) => p.v), view.startVal, reqEnd];
  const { lo: yMin, hi: yMax, step } = niceBounds(Math.min(...vals), Math.max(1, ...vals));
  const ySpan = yMax - yMin || 1;
  const xSpan = view.lastMs - view.windowStartMs || 1;
  const X = (ms: number) => pad.left + ((ms - view.windowStartMs) / xSpan) * iw;
  const Y = (v: number) => pad.top + ih - ((v - yMin) / ySpan) * ih;

  const line = view.pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${X(p.ms).toFixed(1)},${Y(p.v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${X(view.lastMs).toFixed(1)},${(pad.top + ih).toFixed(1)} L${X(view.windowStartMs).toFixed(1)},${(pad.top + ih).toFixed(1)} Z`;
  const requiredLine = `M${X(view.windowStartMs).toFixed(1)},${Y(view.startVal).toFixed(1)} L${X(view.lastMs).toFixed(1)},${Y(reqEnd).toFixed(1)}`;

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) yTicks.push(v);
  const xTicks = [view.windowStartMs, (view.windowStartMs + view.lastMs) / 2, view.lastMs];
  const focus = hover != null ? view.pts[hover] : null;

  // The series is a UTC day grid and the deadline is a calendar date, so both
  // are formatted in UTC. Local formatting shifted every label by a day for
  // viewers west of UTC and tipped the 30 Nov deadline into December east of it.
  const day = (ms: number) =>
    format.dateTime(new Date(ms), { day: "numeric", month: "short", timeZone: "UTC" });
  const minutes = (value: number) => format.number(Math.round(value));
  const rate = (value: number) =>
    t("perDay", { rate: format.number(Math.round(value * 10) / 10) });
  // "Since grant" is the wrong name for a range that predates the grant.
  const rangeLabel = (id: RangeId) =>
    preWindow && id === "all" ? t("ranges.allUpcoming") : t(`ranges.${id}`);
  const opensLabel = day(Date.parse(grantStart));

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("summary", {
            current: minutes(currentMinutes),
            target: format.number(targetMinutes),
            date: format.dateTime(new Date(deadline), {
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
          })}
        </p>
      </div>

      {/* Range toggle */}
      <div
        role="group"
        aria-label={t("rangeLabel")}
        className="inline-flex self-start rounded-full border border-border bg-background p-0.5"
      >
        {RANGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setRange(option.id);
              setHover(null);
            }}
            aria-pressed={range === option.id}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              range === option.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rangeLabel(option.id)}
          </button>
        ))}
      </div>

      {/* Ahead / behind readout */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {preWindow
              ? t("upcomingEyebrow", { range: rangeLabel(range) })
              : t("vsPaceNeeded", { range: rangeLabel(range) })}
          </div>
          <div
            className={cn(
              "mt-0.5 text-3xl font-semibold tracking-tight",
              ahead ? "text-primary" : "text-amber-600 dark:text-amber-400",
            )}
          >
            {ahead ? "+" : "\u2212"}
            {minutes(Math.abs(view.delta))}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {preWindow
              ? t("upcomingPhrase", { date: opensLabel })
              : t(ahead ? "aheadPhrase" : "behindPhrase", { phrase: t(`phrases.${range}`) })}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">+{minutes(view.actualGrowth)}</span>{" "}
            {t("actual")}
          </div>
          <div>
            {preWindow ? (
              t("upcomingNeeded", { date: opensLabel })
            ) : (
              <>
                <span className="font-medium text-foreground">+{minutes(view.requiredGrowth)}</span>{" "}
                {t("needed")}
              </>
            )}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums">
            {preWindow
              ? t("upcomingRates", {
                  actual: rate(view.actualPace),
                  needed: rate(pace.requiredPerDay ?? view.requiredPace),
                  date: opensLabel,
                })
              : t("rates", { actual: rate(view.actualPace), needed: rate(view.requiredPace) })}
          </div>
        </div>
      </div>

      {/* Chart. Decorative: every value it encodes is stated in the readout
          above and the summary below, so screen readers are not sent through
          300 SVG nodes. */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="mt-1 w-full"
        style={{ aspectRatio: `${VW} / ${VH}` }}
        role="presentation"
        aria-hidden
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * VW;
          let best = 0;
          let bestDistance = Infinity;
          view.pts.forEach((p, i) => {
            const distance = Math.abs(X(p.ms) - px);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={pad.left + iw}
              y1={Y(v)}
              y2={Y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={pad.left - 10} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
              {format.number(Math.round(v))}
            </text>
          </g>
        ))}

        {/* Pace needed. Coloured through currentColor so it uses the same
            amber as the rest of the page without depending on a theme
            variable being emitted. */}
        <path
          d={requiredLine}
          className="text-amber-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
        {/* Actual */}
        <path d={area} fill="var(--primary)" opacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {xTicks.map((ms, i) => (
          <text
            key={ms}
            x={X(ms)}
            y={VH - 8}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="var(--muted-foreground)"
          >
            {day(ms)}
          </text>
        ))}

        {focus ? (
          <g>
            <line
              x1={X(focus.ms)}
              x2={X(focus.ms)}
              y1={pad.top}
              y2={pad.top + ih}
              stroke="var(--foreground)"
              strokeOpacity={0.18}
              strokeWidth={1}
            />
            <circle
              cx={X(focus.ms)}
              cy={Y(focus.v)}
              r={4}
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {/* Legend + overall footnote */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-primary" />
            {t("legendActual")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-px w-4 border-t border-dashed border-amber-500" />
            {t("legendNeeded")}
          </span>
          {focus ? (
            <span className="tabular-nums text-foreground/70">
              {t("focus", { minutes: minutes(focus.v), date: day(focus.ms) })}
            </span>
          ) : null}
        </div>
        <span>
          {pace.status === "met"
            ? t("overallMet")
            : preWindow
              ? t("overallUpcoming", { date: opensLabel })
              : t(pace.deltaVsPace >= 0 ? "overallAhead" : "overallBehind", {
                  minutes: minutes(Math.abs(pace.deltaVsPace)),
                })}
        </span>
      </div>
    </section>
  );
}
