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
  formatWindowMinute,
  isFullDay,
  isInWindow,
  minuteAtFraction,
  panWindow,
  windowEnd,
  windowFraction,
  windowTicks,
  zoomWindow,
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
  x: number;
  y: number;
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
    if (run.length > 0 && points[index].minuteOfDay - points[index - 1].minuteOfDay > GAP_MINUTES) {
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
  playHintLabel?: string;
  stopHintLabel?: string;
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
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startAngle: number;
    startWindow: TimeWindow;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  // The wheel handler is registered once but needs the live window.
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

  /** Only the slice on show is drawn — the rest of the day is off the ring. */
  const visiblePoints = useMemo(
    () => (isFullDay(view) ? points : points.filter((point) => isInWindow(point.minuteOfDay, view))),
    [points, view],
  );

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
      .map((minute) => ({ minute, label: formatWindowMinute(minute), major: minute % 60 === 0 }));
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
      const gap = isFullDay(view)
        ? Math.min(Math.abs(point.minuteOfDay - minute), 1440 - Math.abs(point.minuteOfDay - minute))
        : Math.abs(point.minuteOfDay - minute);
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

  /* Wheel over the ring zooms; anywhere else the page keeps its scroll.
     Registered natively because React's wheel listener is passive. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onWindowChange) return;
    const handleWheel = (event: WheelEvent) => {
      const pointer = readPointer(event);
      if (!pointer) return;
      const pinch = event.ctrlKey || event.metaKey;
      if (!pinch && !pointer.onRing) return;
      event.preventDefault();
      // Gentle: about a quarter closer per mouse notch, so a flick of the
      // wheel refines the view instead of slamming into the tightest zoom.
      onWindowChange(zoomWindow(viewRef.current, Math.exp(event.deltaY * 0.0025), pointer.minute));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
    // readPointer only reads refs, so the listener never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWindowChange]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !onWindowChange) return;
    const pointer = readPointer(event);
    if (!pointer?.onRing) return;
    dragRef.current = {
      startAngle: pointer.angle,
      startWindow: viewRef.current,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointer = readPointer(event);
    if (!pointer) return;
    const drag = dragRef.current;
    if (drag) {
      const travelled = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      if (!drag.moved && travelled < DRAG_SLOP_PX) return;
      drag.moved = true;
      setDragging(true);
      setHover(null);
      // Turning the dial carries the times with the cursor.
      let delta = pointer.angle - drag.startAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      onWindowChange?.(panWindow(drag.startWindow, -(delta / (2 * Math.PI)) * drag.startWindow.span));
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
    const marker = polar(best.minuteOfDay, OUTER_RADIUS, view);
    setHover({
      point: best,
      x: (marker.x / VIEW_SIZE) * pointer.rect.width,
      y: (marker.y / VIEW_SIZE) * pointer.rect.height,
    });
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag?.moved) return;
    if (hover && onPointClick) onPointClick(hover.point.minuteOfDay);
  };

  const zoomed = !isFullDay(view);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className={`block h-auto w-full select-none ${
          dragging ? "cursor-grabbing" : hover && onPointClick ? "cursor-pointer" : zoomable ? "cursor-grab" : ""
        }`}
        role="img"
        aria-label={props.title}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onPointerLeave={(event) => {
          // The tooltip sits over the dial and a global `[data-rk] *` rule
          // makes it hit-testable, so React reports a leave the moment it
          // appears — only clear the hover when the pointer really left.
          const rect = svgRef.current?.getBoundingClientRect();
          // A 1px margin, so leaving across an edge still counts as leaving.
          const inside =
            rect &&
            event.clientX > rect.left + 1 &&
            event.clientX < rect.right - 1 &&
            event.clientY > rect.top + 1 &&
            event.clientY < rect.bottom - 1;
          if (!inside) setHover(null);
        }}
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

      {hover ? (
        <div
          className="absolute z-10 min-w-40 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
          // `pointerEvents` is inline because a global `[data-rk] *` rule
          // (RainbowKit) outranks the utility class — a tooltip that takes the
          // pointer would cancel the very hover it is describing.
          style={{
            left: hover.x,
            top: Math.max(0, hover.y - 8),
            transform: "translate(-50%, -100%)",
            pointerEvents: "none",
          }}
        >
          <p className="font-semibold tabular-nums text-foreground">{formatMinuteOfDay(hover.point.minuteOfDay)}</p>
          {onPointClick ? (
            <p className="mt-0.5 text-[11px] text-primary">
              {playingMinute === hover.point.minuteOfDay ? props.stopHintLabel : props.playHintLabel}
            </p>
          ) : null}
          <ul className="mt-1 space-y-0.5">
            {hover.point.pmn.map((value, band) =>
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
