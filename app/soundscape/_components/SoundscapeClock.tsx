"use client";

/**
 * Polar "Power-Minus-Noise" chart, styled after the GainForest soundscape
 * figures: each frequency bin is a coloured line drawn radially around a dial.
 * Time runs clockwise from the right (3 o'clock), so a full day puts 6:00 at
 * the bottom, 12:00 at the left and 18:00 at the top.
 *
 * The dial is zoomable: it draws whatever slice of the day `window` describes,
 * spread over the whole ring. At full-day zoom that is the familiar 24-hour
 * clock; zoomed in, minutes that shared a sliver of a degree get room to
 * breathe and can be pointed at individually.
 *
 * Zooming is a sweep: press on the ring and drag around it, and the arc you
 * paint becomes the new window. A press without a sweep is a click, and plays
 * the recording of that minute.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMinuteOfDay } from "@/lib/soundscape/audiomoth";
import {
  BAND_COLORS,
  formatPmnValue as formatValue,
  niceCeil,
  type SoundscapePoint,
} from "@/lib/soundscape/analysis";
import {
  clampWindow,
  formatWindowMinute,
  isFullDay,
  isInWindow,
  MIN_WINDOW_SPAN,
  MINUTES_PER_DAY,
  minuteAtFraction,
  windowEnd,
  windowFraction,
  windowTicks,
  type TimeWindow,
} from "@/lib/soundscape/zoom";

export { BAND_COLORS };

const VIEW_SIZE = 760;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 250;
const INNER_RADIUS = 34;
/** Break a band's line when neighbouring points are further apart than this. */
const GAP_MINUTES = 90;
/** Hover picks the nearest point within this arc (in degrees). */
const HOVER_TOLERANCE_DEGREES = 11.25;
/** A pointer that travelled less than this is a click, not a drag. */
const DRAG_SLOP_PX = 4;

type HoverState = {
  point: SoundscapePoint;
};

function angleForMinute(minuteOfDay: number, view: TimeWindow): number {
  // Window start -> 0 rad (right), clockwise (SVG y grows downwards).
  return windowFraction(minuteOfDay, view) * 2 * Math.PI;
}

function polar(minuteOfDay: number, radius: number, view: TimeWindow): { x: number; y: number } {
  const angle = angleForMinute(minuteOfDay, view);
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
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

function buildBandPath(
  points: SoundscapePoint[],
  band: number,
  maxValue: number,
  view: TimeWindow,
): string | null {
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length; index++) {
    const gap =
      index > 0
        ? (windowFraction(points[index].minuteOfDay, view) -
            windowFraction(points[index - 1].minuteOfDay, view)) *
          view.span
        : 0;
    if (run.length > 0 && gap > GAP_MINUTES) {
      runs.push(run);
      run = [];
    }
    run.push(polar(points[index].minuteOfDay, radiusForValue(points[index].pmn[band] ?? 0, maxValue), view));
  }
  if (run.length > 0) runs.push(run);

  // Only a full day can close the loop; a zoomed slice has two open ends.
  const wraps =
    isFullDay(view) &&
    points.length > 2 &&
    points[0].minuteOfDay + 1440 - points[points.length - 1].minuteOfDay <= GAP_MINUTES;
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

/** A point on the dial at a raw angle, for shapes that are drawn by sweep. */
function pointAtAngle(angle: number, radius: number): { x: number; y: number } {
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

/**
 * Wedge for the sweep being made. `to` is the raw, unwrapped end of the drag,
 * so its sign is the direction the pointer travelled: that is what decides
 * which way round the ring the wedge goes.
 */
function sectorPath(from: number, to: number, view: TimeWindow, inner: number, outer: number): string {
  const delta = (to - from) / view.span;
  const angleFrom = windowFraction(from, view) * 2 * Math.PI;
  const angleTo = angleFrom + delta * 2 * Math.PI;
  const largeArc = Math.abs(delta) > 0.5 ? 1 : 0;
  const clockwise = delta >= 0 ? 1 : 0;
  const a = pointAtAngle(angleFrom, outer);
  const b = pointAtAngle(angleTo, outer);
  const aInner = pointAtAngle(angleFrom, inner);
  const bInner = pointAtAngle(angleTo, inner);
  return [
    `M${aInner.x.toFixed(1)} ${aInner.y.toFixed(1)}`,
    `L${a.x.toFixed(1)} ${a.y.toFixed(1)}`,
    `A${outer} ${outer} 0 ${largeArc} ${clockwise} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    `L${bInner.x.toFixed(1)} ${bInner.y.toFixed(1)}`,
    `A${inner} ${inner} 0 ${largeArc} ${clockwise === 1 ? 0 : 1} ${aInner.x.toFixed(1)} ${aInner.y.toFixed(1)}`,
    "Z",
  ].join("");
}

type SoundscapeClockProps = {
  points: SoundscapePoint[];
  visibleBands: boolean[];
  bandLabels: string[];
  title: string;
  radialLabel: string;
  timeLabel: string;
  legendTitle: string;
  /** When set, clicking a hovered time plays (or stops) its recording. */
  onPointClick?: (minuteOfDay: number) => void;
  /** Minute currently playing (highlighted on the dial), if any. */
  playingMinute?: number | null;
  /** Fired when a click lands on the dial but not on a time — clicking off
   *  the ring is how you stop whatever that ring started. */
  onBackgroundClick?: () => void;
  /** Slice of the day the dial is showing; the whole day by default. */
  window: TimeWindow;
  onWindowChange?: (window: TimeWindow) => void;
  /** Shown in the middle when the zoomed slice holds no recordings. */
  emptyLabel?: string;
};

export function SoundscapeClock(props: SoundscapeClockProps) {
  const { points, visibleBands, onPointClick, playingMinute, window: view, onWindowChange } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  /** The arc being swept out, in minutes of the day (null while idle). */
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{
    fromMinute: number;
    lastAngle: number;
    /** Signed angular travel since the press, so a sweep can pass 12 o'clock. */
    travel: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const zoomable = Boolean(onWindowChange);

  /* The tooltip is anchored to the chart, so it must not survive the page
     scrolling out from under the cursor (no pointer event is fired then). */
  useEffect(() => {
    if (!hover) return;
    const clear = () => setHover(null);
    window.addEventListener("scroll", clear, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", clear, { capture: true });
  }, [hover]);

  /** Only the slice on show is drawn, ordered by where it sits on the ring —
   *  a window across midnight puts 23:00 before 01:00. */
  const visiblePoints = useMemo(() => {
    if (isFullDay(view)) return points;
    return points
      .filter((point) => isInWindow(point.minuteOfDay, view))
      .sort((a, b) => windowFraction(a.minuteOfDay, view) - windowFraction(b.minuteOfDay, view));
  }, [points, view]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const point of visiblePoints) {
      for (let band = 0; band < point.pmn.length; band++) {
        if (visibleBands[band]) max = Math.max(max, point.pmn[band]);
      }
    }
    return niceCeil(max);
  }, [visiblePoints, visibleBands]);

  const bandPaths = useMemo(
    () =>
      BAND_COLORS.map((_, band) =>
        visibleBands[band] && visiblePoints.length > 0
          ? buildBandPath(visiblePoints, band, maxValue, view)
          : null,
      ),
    [visiblePoints, visibleBands, maxValue, view],
  );

  const gridRings = [0.25, 0.5, 0.75, 1];

  /** Hour spokes for a whole day; finer, round steps once zoomed in. */
  const spokes = useMemo(() => {
    if (isFullDay(view)) {
      return Array.from({ length: 24 }, (_, hour) => ({
        minute: hour * 60,
        label: `${hour}:00`,
        major: hour % 6 === 0,
      }));
    }
    // The last tick would land on top of the first one — the ring's two ends
    // meet at the same angle — so leave it out.
    return windowTicks(view, 12)
      .filter((minute) => minute < windowEnd(view) - view.span * 0.02)
      .map((minute) => ({
        minute: minute % MINUTES_PER_DAY,
        label: formatWindowMinute(minute),
        major: minute % 60 === 0,
      }));
  }, [view]);

  /** Where the cursor is on the dial, or null when it is off the ring. */
  const readPointer = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_SIZE;
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const fraction = ((angle / (2 * Math.PI)) + 1) % 1;
    return {
      rect,
      distance,
      angle,
      onRing: distance >= INNER_RADIUS && distance <= OUTER_RADIUS + 30,
      minute: minuteAtFraction(fraction, viewRef.current),
    };
  };

  const nearestPoint = (minute: number): SoundscapePoint | null => {
    let best: SoundscapePoint | null = null;
    let bestGap = Infinity;
    for (const point of visiblePoints) {
      const difference = Math.abs(point.minuteOfDay - minute);
      const gap = Math.min(difference, MINUTES_PER_DAY - difference);
      if (gap < bestGap) {
        bestGap = gap;
        best = point;
      }
    }
    // Tolerance is an arc, so zooming in narrows it in minutes: the tighter
    // the zoom, the more exactly you can pick a recording.
    const tolerance = (HOVER_TOLERANCE_DEGREES / 360) * view.span;
    return best && bestGap <= tolerance ? best : null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !onWindowChange) return;
    const pointer = readPointer(event);
    if (!pointer?.onRing) return;
    dragRef.current = {
      fromMinute: pointer.minute,
      lastAngle: pointer.angle,
      travel: 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = readPointer(event);
    if (!pointer) return;
    const drag = dragRef.current;
    if (drag) {
      const travelled = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      if (!drag.moved && travelled < DRAG_SLOP_PX) return;
      drag.moved = true;
      setHover(null);
      // Accumulate the signed turn so a sweep can run past the ring's seam,
      // and cap it at one full turn — the window on show is the most there is.
      let step = pointer.angle - drag.lastAngle;
      if (step > Math.PI) step -= 2 * Math.PI;
      if (step < -Math.PI) step += 2 * Math.PI;
      drag.lastAngle = pointer.angle;
      drag.travel = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, drag.travel + step));
      setBrush({
        from: drag.fromMinute,
        to: drag.fromMinute + (drag.travel / (2 * Math.PI)) * viewRef.current.span,
      });
      return;
    }
    if (!pointer.onRing || visiblePoints.length === 0) {
      setHover(null);
      return;
    }
    const best = nearestPoint(pointer.minute);
    if (!best) {
      setHover(null);
      return;
    }
    setHover({ point: best });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    const swept = brush;
    setBrush(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag?.moved) {
      /* On a time: play it (or nothing, when the dial is read-only). Off the
         ring: a click on empty space stops what is playing. */
      if (hover) onPointClick?.(hover.point.minuteOfDay);
      else props.onBackgroundClick?.();
      return;
    }
    if (!swept || !onWindowChange) return;
    // A sweep shorter than the tightest zoom is a slip of the hand, not a
    // selection — leave the dial where it is rather than jumping somewhere odd.
    const from = Math.min(swept.from, swept.to);
    const to = Math.max(swept.from, swept.to);
    if (to - from < MIN_WINDOW_SPAN / 2) return;
    onWindowChange(clampWindow({ start: from, span: to - from }));
  };

  const zoomed = !isFullDay(view);

  return (
    /* The pointer handlers live on the wrapper, not the <svg>: the tooltip is
       drawn over the dial and would otherwise swallow the press that starts a
       sweep. Coordinates are still read from the dial's own box. */
    <div
      className="relative w-full"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => {
        dragRef.current = null;
        setBrush(null);
      }}
      onPointerLeave={(event) => {
        // A 1px margin, so leaving across an edge still counts as leaving.
        const rect = svgRef.current?.getBoundingClientRect();
        const inside =
          rect &&
          event.clientX > rect.left + 1 &&
          event.clientX < rect.right - 1 &&
          event.clientY > rect.top + 1 &&
          event.clientY < rect.bottom - 1;
        if (!inside) setHover(null);
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className={`block h-auto w-full select-none ${
          brush ? "cursor-crosshair" : hover && onPointClick ? "cursor-pointer" : zoomable ? "cursor-crosshair" : ""
        }`}
        role="img"
        aria-label={props.title}
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

        {/* The sweep being painted */}
        {brush ? (
          <g>
            <path
              d={sectorPath(brush.from, brush.to, view, INNER_RADIUS, OUTER_RADIUS)}
              className="fill-primary/15 stroke-primary/50"
              strokeWidth={1.5}
            />
            <text
              x={CENTER}
              y={CENTER + 5}
              fontSize={15}
              textAnchor="middle"
              className="fill-foreground tabular-nums"
            >
              {`${formatMinuteOfDay(brush.to >= brush.from ? brush.from : brush.to)} \u2013 ${formatMinuteOfDay(
                brush.to >= brush.from ? brush.to : brush.from,
              )}`}
            </text>
          </g>
        ) : null}

        {/* Time spokes + labels */}
        {spokes.map((spoke) => {
          const inner = polar(spoke.minute, INNER_RADIUS, view);
          const outer = polar(spoke.minute, OUTER_RADIUS, view);
          const label = polar(spoke.minute, OUTER_RADIUS + 22, view);
          return (
            <g key={spoke.minute}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                strokeOpacity={spoke.major ? 0.32 : 0.12}
                className="text-muted-foreground"
              />
              <text
                x={label.x}
                y={label.y}
                fontSize={12}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground tabular-nums"
              >
                {spoke.label}
              </text>
            </g>
          );
        })}

        {/* Radial value labels along the start-of-window axis (0 at mid-radius) */}
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

        {/* One tick per recorded minute, so a zoomed dial shows what can be picked */}
        {zoomed
          ? visiblePoints.map((point) => {
              const from = polar(point.minuteOfDay, OUTER_RADIUS + 2, view);
              const to = polar(point.minuteOfDay, OUTER_RADIUS + 8, view);
              const active =
                playingMinute === point.minuteOfDay || hover?.point.minuteOfDay === point.minuteOfDay;
              return (
                <line
                  key={`tick-${point.minuteOfDay}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="currentColor"
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeOpacity={active ? 1 : 0.45}
                  className={active ? "text-primary" : "text-muted-foreground"}
                />
              );
            })
          : null}

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

        {/* Playing spoke */}
        {playingMinute != null && isInWindow(playingMinute, view) ? (
          <g className="text-primary">
            <line
              x1={polar(playingMinute, INNER_RADIUS, view).x}
              y1={polar(playingMinute, INNER_RADIUS, view).y}
              x2={polar(playingMinute, OUTER_RADIUS, view).x}
              y2={polar(playingMinute, OUTER_RADIUS, view).y}
              stroke="currentColor"
              strokeOpacity={0.7}
              strokeWidth={2}
            />
            <circle
              cx={polar(playingMinute, OUTER_RADIUS, view).x}
              cy={polar(playingMinute, OUTER_RADIUS, view).y}
              r={5}
              fill="currentColor"
            >
              <animate attributeName="r" values="4;6;4" dur="1.2s" repeatCount="indefinite" />
            </circle>
          </g>
        ) : null}

        {/* Hover spoke */}
        {hover ? (
          <line
            x1={polar(hover.point.minuteOfDay, INNER_RADIUS, view).x}
            y1={polar(hover.point.minuteOfDay, INNER_RADIUS, view).y}
            x2={polar(hover.point.minuteOfDay, OUTER_RADIUS, view).x}
            y2={polar(hover.point.minuteOfDay, OUTER_RADIUS, view).y}
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeDasharray="3 3"
            className="text-foreground"
          />
        ) : null}

        {/* The hovered time, printed in the middle of the dial — the same
            readout a sweep uses for its range. Hover and sweep never coincide:
            starting a drag clears the hover. */}
        {hover ? (
          <text
            x={CENTER}
            y={CENTER + 5}
            fontSize={15}
            textAnchor="middle"
            className="fill-foreground tabular-nums"
          >
            {formatMinuteOfDay(hover.point.minuteOfDay)}
          </text>
        ) : null}

        {zoomed && visiblePoints.length === 0 && props.emptyLabel ? (
          <text x={CENTER} y={CENTER + 4} fontSize={14} textAnchor="middle" className="fill-muted-foreground">
            {props.emptyLabel}
          </text>
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
  // Wide enough for a translated voice-group name plus its frequency range
  // (e.g. "Kuimba kwa ndege · 250 Hz–1 kHz") without clipping in the PNG export.
  const width = 208;
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
