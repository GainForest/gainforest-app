"use client";

/**
 * A 24-hour polar "Power-Minus-Noise" chart, styled after the GainForest
 * soundscape figures: each frequency bin is a coloured line, drawn radially
 * around a 24-hour dial. 0:00 sits at the right (3 o'clock) and time runs
 * clockwise, so 6:00 is at the bottom, 12:00 at the left and 18:00 at the top.
 */

import { useMemo, useRef, useState } from "react";
import { formatMinuteOfDay } from "@/lib/soundscape/audiomoth";
import { BAND_COLORS, type SoundscapePoint } from "@/lib/soundscape/analysis";

export { BAND_COLORS };

const VIEW_SIZE = 760;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 250;
const INNER_RADIUS = 34;
/** Break a band's line when neighbouring points are further apart than this. */
const GAP_MINUTES = 90;

type HoverState = {
  point: SoundscapePoint;
  x: number;
  y: number;
};

function angleForMinute(minuteOfDay: number): number {
  // 0:00 -> 0 rad (right), clockwise (SVG y grows downwards).
  return (minuteOfDay / 1440) * 2 * Math.PI;
}

function polar(minuteOfDay: number, radius: number): { x: number; y: number } {
  const angle = angleForMinute(minuteOfDay);
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatValue(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${Math.round(value / 1000)}k`;
  if (abs >= 10) return `${Math.round(value)}`;
  return value.toPrecision(2);
}

/**
 * Radial scale mirrors the reference matplotlib figure: the domain runs from
 * -maxValue at the inner edge to +maxValue at the outer edge, so a value of 0
 * sits at mid-radius and all (non-negative) PMN values fill the outer half.
 * This keeps every band visible instead of collapsing quiet hours to a point.
 */
function radiusForValue(value: number, maxValue: number): number {
  if (maxValue <= 0) return INNER_RADIUS;
  const clamped = Math.max(-maxValue, Math.min(value, maxValue));
  return INNER_RADIUS + ((clamped + maxValue) / (2 * maxValue)) * (OUTER_RADIUS - INNER_RADIUS);
}

function buildBandPath(points: SoundscapePoint[], band: number, maxValue: number): string | null {
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length; index++) {
    if (run.length > 0 && points[index].minuteOfDay - points[index - 1].minuteOfDay > GAP_MINUTES) {
      runs.push(run);
      run = [];
    }
    run.push(polar(points[index].minuteOfDay, radiusForValue(points[index].pmnDb[band] ?? 0, maxValue)));
  }
  if (run.length > 0) runs.push(run);

  const wraps =
    points.length > 2 && points[0].minuteOfDay + 1440 - points[points.length - 1].minuteOfDay <= GAP_MINUTES;
  if (wraps && runs.length === 1) {
    return `M${runs[0].map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z`;
  }
  if (wraps && runs.length > 1) {
    const tail = runs.pop()!;
    runs[0] = [...tail, ...runs[0]];
  }
  const segments = runs
    .filter((segment) => segment.length > 1)
    .map((segment) => `M${segment.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}`);
  return segments.length > 0 ? segments.join("") : null;
}

type SoundscapeClockProps = {
  points: SoundscapePoint[];
  visibleBands: boolean[];
  bandLabels: string[];
  title: string;
  radialLabel: string;
  timeLabel: string;
  legendTitle: string;
};

export function SoundscapeClock(props: SoundscapeClockProps) {
  const { points, visibleBands } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const point of points) {
      for (let band = 0; band < point.pmnDb.length; band++) {
        if (visibleBands[band]) max = Math.max(max, point.pmnDb[band]);
      }
    }
    return niceCeil(max);
  }, [points, visibleBands]);

  const bandPaths = useMemo(
    () =>
      BAND_COLORS.map((_, band) =>
        visibleBands[band] && points.length > 0 ? buildBandPath(points, band, maxValue) : null,
      ),
    [points, visibleBands, maxValue],
  );

  const gridRings = [0.25, 0.5, 0.75, 1];

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_SIZE;
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distance = Math.hypot(dx, dy);
    if (distance < INNER_RADIUS || distance > OUTER_RADIUS + 30) {
      setHover(null);
      return;
    }
    const minute = ((Math.atan2(dy, dx) / (2 * Math.PI)) * 1440 + 1440) % 1440;
    let best: SoundscapePoint | null = null;
    let bestGap = Infinity;
    for (const point of points) {
      const gap = Math.min(Math.abs(point.minuteOfDay - minute), 1440 - Math.abs(point.minuteOfDay - minute));
      if (gap < bestGap) {
        bestGap = gap;
        best = point;
      }
    }
    if (!best || bestGap > 45) {
      setHover(null);
      return;
    }
    const marker = polar(best.minuteOfDay, OUTER_RADIUS);
    setHover({ point: best, x: (marker.x / VIEW_SIZE) * rect.width, y: (marker.y / VIEW_SIZE) * rect.height });
  };

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label={props.title}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
        data-soundscape-clock
      >
        {/* Title */}
        <text x={CENTER} y={26} textAnchor="middle" fontSize={17} className="fill-foreground">
          {props.title}
        </text>

        {/* Radial grid rings */}
        {gridRings.map((fraction) => (
          <circle
            key={fraction}
            cx={CENTER}
            cy={CENTER}
            r={INNER_RADIUS + fraction * (OUTER_RADIUS - INNER_RADIUS)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={fraction === 1 ? 0.55 : fraction === 0.5 ? 0.3 : 0.14}
            className="text-muted-foreground"
          />
        ))}

        {/* Hour spokes + labels */}
        {Array.from({ length: 24 }, (_, hour) => {
          const inner = polar(hour * 60, INNER_RADIUS);
          const outer = polar(hour * 60, OUTER_RADIUS);
          const label = polar(hour * 60, OUTER_RADIUS + 22);
          return (
            <g key={hour}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                strokeOpacity={hour % 6 === 0 ? 0.32 : 0.12}
                className="text-muted-foreground"
              />
              <text
                x={label.x}
                y={label.y}
                fontSize={12}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground"
              >
                {`${hour}:00`}
              </text>
            </g>
          );
        })}

        {/* Radial value labels along the 0:00 axis (0 at mid-radius) */}
        {gridRings
          .filter((fraction) => fraction >= 0.5)
          .map((fraction) => (
            <text
              key={`value-${fraction}`}
              x={CENTER + INNER_RADIUS + fraction * (OUTER_RADIUS - INNER_RADIUS)}
              y={CENTER - 4}
              fontSize={10}
              textAnchor="middle"
              className="fill-muted-foreground"
              opacity={0.85}
            >
              {formatValue((2 * fraction - 1) * maxValue)}
            </text>
          ))}

        {/* Axis labels */}
        <text
          x={26}
          y={CENTER}
          fontSize={13}
          textAnchor="middle"
          className="fill-muted-foreground"
          transform={`rotate(-90 26 ${CENTER})`}
        >
          {props.radialLabel}
        </text>
        <text x={CENTER} y={VIEW_SIZE - 10} fontSize={13} textAnchor="middle" className="fill-muted-foreground">
          {props.timeLabel}
        </text>

        {/* Band lines */}
        {bandPaths.map((path, band) =>
          path ? (
            <path
              key={band}
              d={path}
              fill="none"
              stroke={BAND_COLORS[band]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <title>{props.bandLabels[band]}</title>
            </path>
          ) : null,
        )}

        {/* Hover spoke */}
        {hover ? (
          <line
            x1={polar(hover.point.minuteOfDay, INNER_RADIUS).x}
            y1={polar(hover.point.minuteOfDay, INNER_RADIUS).y}
            x2={polar(hover.point.minuteOfDay, OUTER_RADIUS).x}
            y2={polar(hover.point.minuteOfDay, OUTER_RADIUS).y}
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeDasharray="3 3"
            className="text-foreground"
          />
        ) : null}

        {/* Legend, bottom-left like the reference figure */}
        <Legend
          title={props.legendTitle}
          labels={props.bandLabels}
          visibleBands={visibleBands}
          x={54}
          y={VIEW_SIZE - 168}
        />
      </svg>

      {hover ? (
        <div
          className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: hover.x, top: Math.max(0, hover.y - 8), transform: "translate(-50%, -100%)" }}
        >
          <p className="font-semibold text-foreground">{formatMinuteOfDay(hover.point.minuteOfDay)}</p>
          <ul className="mt-1 space-y-0.5">
            {hover.point.pmnDb.map((value, band) =>
              visibleBands[band] ? (
                <li key={band} className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: BAND_COLORS[band] }} />
                  <span className="tabular-nums">
                    {props.bandLabels[band]}: {formatValue(value)}
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Legend(props: {
  title: string;
  labels: string[];
  visibleBands: boolean[];
  x: number;
  y: number;
}) {
  const rowHeight = 20;
  const width = 148;
  const height = 26 + props.labels.length * rowHeight;
  return (
    <g transform={`translate(${props.x} ${props.y})`}>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={6}
        fill="var(--card, #ffffff)"
        stroke="currentColor"
        strokeOpacity={0.3}
        className="text-muted-foreground"
      />
      <text x={12} y={18} fontSize={12} fontWeight={600} className="fill-foreground">
        {props.title}
      </text>
      {props.labels.map((label, band) => (
        <g key={label} transform={`translate(12 ${26 + band * rowHeight})`} opacity={props.visibleBands[band] ? 1 : 0.35}>
          <line x1={0} y1={7} x2={24} y2={7} stroke={BAND_COLORS[band]} strokeWidth={2.5} />
          <text x={32} y={11} fontSize={11} className="fill-foreground">
            {label}
          </text>
        </g>
      ))}
    </g>
  );
}
