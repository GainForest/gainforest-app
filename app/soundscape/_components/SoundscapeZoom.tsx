"use client";

/**
 * Detail strip under the 24-hour clock: the same Power-Minus-Noise bands drawn
 * on a straight time axis that can be zoomed from the whole day down to ten
 * minutes, so a single recording can be picked out and played by its exact
 * time instead of guessing at a sliver of the dial.
 *
 * The window maths live in lib/soundscape/zoom.ts; this file is interaction
 * plus SVG.
 */

import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BAND_COLORS,
  formatPmnValue,
  niceCeil,
  type SoundscapePoint,
} from "@/lib/soundscape/analysis";
import { formatMinuteOfDay } from "@/lib/soundscape/audiomoth";
import {
  centerWindow,
  formatWindowMinute,
  FULL_DAY_WINDOW,
  isFullDay,
  minuteAtFraction,
  panWindow,
  SERIES_GAP_MINUTES,
  windowEnd,
  windowFraction,
  windowTicks,
  zoomWindow,
  type TimeWindow,
} from "@/lib/soundscape/zoom";

const VIEW_W = 900;
const VIEW_H = 240;
const PAD = { left: 56, right: 14, top: 14, bottom: 30 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
/** One notch of the zoom buttons / keyboard shortcuts. */
const ZOOM_STEP = 1.6;
/** A pointer that travelled less than this is a click, not a pan. */
const DRAG_SLOP_PX = 4;

type HoverState = { point: SoundscapePoint; xPx: number };

export type SoundscapeZoomLabels = {
  range: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
  hint: string;
  timeAxis: string;
  empty: string;
  playHint: string;
  stopHint: string;
};

type SoundscapeZoomProps = {
  points: SoundscapePoint[];
  window: TimeWindow;
  onWindowChange: (window: TimeWindow) => void;
  visibleBands: boolean[];
  bandLabels: string[];
  playingMinute?: number | null;
  /** Called with the exact minute of the point that was clicked. */
  onMinuteClick?: (minuteOfDay: number) => void;
  labels: SoundscapeZoomLabels;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function SoundscapeZoom(props: SoundscapeZoomProps) {
  const { points, window: view, onWindowChange, visibleBands, playingMinute, onMinuteClick, labels } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startClientX: number; startWindow: TimeWindow; moved: boolean } | null>(null);
  // Wheel/keyboard handlers are registered once but need the live window.
  const viewRef = useRef(view);
  viewRef.current = view;

  /** Points close enough to matter for the current window (plus a margin so
   *  the lines still enter the plot from off-screen neighbours). */
  const nearbyPoints = useMemo(() => {
    const from = view.start - view.span;
    const to = windowEnd(view) + view.span;
    return points.filter((point) => point.minuteOfDay >= from && point.minuteOfDay <= to);
  }, [points, view]);

  const pointsInWindow = useMemo(
    () =>
      points.filter(
        (point) => point.minuteOfDay >= view.start && point.minuteOfDay <= windowEnd(view),
      ),
    [points, view],
  );

  /** The scale follows the zoom, so quiet stretches of the day open up. */
  const maxValue = useMemo(() => {
    let max = 0;
    for (const point of nearbyPoints) {
      for (let band = 0; band < point.pmn.length; band++) {
        if (visibleBands[band]) max = Math.max(max, point.pmn[band]);
      }
    }
    return niceCeil(max);
  }, [nearbyPoints, visibleBands]);

  const x = useCallback(
    (minuteOfDay: number) => PAD.left + windowFraction(minuteOfDay, view) * PLOT_W,
    [view],
  );
  const y = useCallback(
    (value: number) => PAD.top + (1 - Math.min(1, Math.max(0, value / maxValue))) * PLOT_H,
    [maxValue],
  );

  const bandPaths = useMemo(() => {
    return BAND_COLORS.map((_, band) => {
      if (!visibleBands[band]) return null;
      const segments: string[] = [];
      let run: string[] = [];
      for (let index = 0; index < nearbyPoints.length; index++) {
        const point = nearbyPoints[index];
        if (
          run.length > 0 &&
          point.minuteOfDay - nearbyPoints[index - 1].minuteOfDay > SERIES_GAP_MINUTES
        ) {
          if (run.length > 1) segments.push(`M${run.join("L")}`);
          run = [];
        }
        run.push(`${x(point.minuteOfDay).toFixed(1)} ${y(point.pmn[band] ?? 0).toFixed(1)}`);
      }
      if (run.length > 1) segments.push(`M${run.join("L")}`);
      return segments.length > 0 ? segments.join("") : null;
    });
  }, [nearbyPoints, visibleBands, x, y]);

  /**
   * Where the buttons and keyboard zoom towards: what is playing, what the
   * cursor is on, or else the loudest moment in view — never the blank middle
   * of the day, which is where a naive "zoom on the centre" lands.
   */
  const zoomFocusMinute = useCallback((): number | undefined => {
    if (playingMinute != null && playingMinute >= view.start && playingMinute <= windowEnd(view)) {
      return playingMinute;
    }
    if (hover) return hover.point.minuteOfDay;
    let best: SoundscapePoint | null = null;
    let bestSum = -Infinity;
    for (const point of pointsInWindow) {
      const sum = point.pmn.reduce((total, value, band) => total + (visibleBands[band] ? value : 0), 0);
      if (sum > bestSum) {
        bestSum = sum;
        best = point;
      }
    }
    return best?.minuteOfDay;
  }, [hover, playingMinute, pointsInWindow, view, visibleBands]);

  /** Button / keyboard zoom: change the span and keep the focus centred. */
  const zoomBy = useCallback(
    (factor: number) => {
      const focus = zoomFocusMinute();
      const next = zoomWindow(viewRef.current, factor, focus);
      onWindowChange(focus === undefined ? next : centerWindow(next, focus));
    },
    [onWindowChange, zoomFocusMinute],
  );

  const minuteAtClientX = useCallback(
    (clientX: number, window = viewRef.current): number => {
      const svg = svgRef.current;
      if (!svg) return window.start;
      const rect = svg.getBoundingClientRect();
      const viewX = ((clientX - rect.left) / rect.width) * VIEW_W;
      return minuteAtFraction(clamp01((viewX - PAD.left) / PLOT_W), window);
    },
    [],
  );

  /** Nearest point to a cursor position, if it is close enough to mean it. */
  const pointNearClientX = useCallback(
    (clientX: number): SoundscapePoint | null => {
      if (pointsInWindow.length === 0) return null;
      const minute = minuteAtClientX(clientX);
      let best: SoundscapePoint | null = null;
      let bestGap = Infinity;
      for (const point of pointsInWindow) {
        const gap = Math.abs(point.minuteOfDay - minute);
        if (gap < bestGap) {
          bestGap = gap;
          best = point;
        }
      }
      // Tolerance in minutes ≈ 24 px of the strip, so zooming in makes the
      // selection tighter instead of always grabbing a neighbour.
      const tolerance = (24 / PLOT_W) * viewRef.current.span;
      return best && bestGap <= tolerance ? best : null;
    },
    [minuteAtClientX, pointsInWindow],
  );

  /* Pinch (ctrl+wheel) zooms, horizontal/shift wheel pans — a plain vertical
     scroll is left to the page so the strip never traps it. Registered
     natively because React's wheel listener is passive. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      const current = viewRef.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        onWindowChange(
          zoomWindow(current, Math.exp(event.deltaY * 0.01), minuteAtClientX(event.clientX, current)),
        );
        return;
      }
      // Two-finger horizontal swipe (or shift+wheel) pans.
      const horizontal = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (horizontal !== 0 && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const perPixel = current.span / Math.max(1, (rect.width * PLOT_W) / VIEW_W);
        onWindowChange(panWindow(current, horizontal * perPixel));
      }
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [minuteAtClientX, onWindowChange]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { startClientX: event.clientX, startWindow: viewRef.current, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.startClientX;
      if (!drag.moved && Math.abs(dx) < DRAG_SLOP_PX) return;
      drag.moved = true;
      setHover(null);
      const rect = svg.getBoundingClientRect();
      const perPixel = drag.startWindow.span / Math.max(1, (rect.width * PLOT_W) / VIEW_W);
      onWindowChange(panWindow(drag.startWindow, -dx * perPixel));
      return;
    }
    const point = pointNearClientX(event.clientX);
    if (!point) {
      setHover(null);
      return;
    }
    const rect = svg.getBoundingClientRect();
    const raw = (x(point.minuteOfDay) / VIEW_W) * rect.width;
    // Keep the tooltip inside the strip near the edges of the window.
    const xPx = Math.min(Math.max(raw, 92), Math.max(92, rect.width - 92));
    setHover({ point, xPx });
  };

  /**
   * The tooltip is drawn over the strip and a global `[data-rk] *` rule
   * (RainbowKit) makes every element hit-testable whatever utility class it
   * carries, so React reports a "leave" as soon as the tooltip appears under
   * the cursor. Only let go of the hover when the pointer really left.
   */
  const handlePointerLeave = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const outside =
      !rect ||
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (outside) setHover(null);
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag || drag.moved) return;
    const point = pointNearClientX(event.clientX);
    if (point && onMinuteClick) onMinuteClick(point.minuteOfDay);
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const current = viewRef.current;
    const step = current.span / 6;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onWindowChange(panWindow(current, -step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onWindowChange(panWindow(current, step));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      onWindowChange(FULL_DAY_WINDOW);
    }
  };

  const ticks = useMemo(() => windowTicks(view), [view]);
  const gridValues = [0, 0.25, 0.5, 0.75, 1];
  const clipId = "soundscape-zoom-clip";
  const rangeLabel = labels.range;

  return (
    <div className="rounded-xl border bg-card/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums text-foreground">{rangeLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{labels.hint}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            disabled={isFullDay(view)}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            <MinusIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isFullDay(view)}
            onClick={() => onWindowChange(FULL_DAY_WINDOW)}
          >
            <RotateCcwIcon className="size-4" />
            {labels.reset}
          </Button>
        </div>
      </div>

      <div className="relative mt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={`block h-auto w-full touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            dragging ? "cursor-grabbing" : hover ? "cursor-pointer" : "cursor-grab"
          }`}
          role="img"
          aria-label={`${labels.timeAxis} ${rangeLabel}`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragging(false);
          }}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={PAD.top - 4} width={PLOT_W} height={PLOT_H + 8} />
            </clipPath>
          </defs>

          {/* Value grid */}
          {gridValues.map((fraction) => (
            <g key={fraction}>
              <line
                x1={PAD.left}
                y1={PAD.top + (1 - fraction) * PLOT_H}
                x2={PAD.left + PLOT_W}
                y2={PAD.top + (1 - fraction) * PLOT_H}
                stroke="currentColor"
                strokeOpacity={fraction === 0 ? 0.4 : 0.12}
                className="text-muted-foreground"
              />
              <text
                x={PAD.left - 8}
                y={PAD.top + (1 - fraction) * PLOT_H + 4}
                fontSize={11}
                textAnchor="end"
                className="fill-muted-foreground"
              >
                {formatPmnValue(fraction * maxValue)}
              </text>
            </g>
          ))}

          {/* Time axis */}
          {ticks.map((minute) => (
            <g key={minute}>
              <line
                x1={x(minute)}
                y1={PAD.top}
                x2={x(minute)}
                y2={PAD.top + PLOT_H + 4}
                stroke="currentColor"
                strokeOpacity={minute % 60 === 0 ? 0.28 : 0.12}
                className="text-muted-foreground"
              />
              <text
                x={x(minute)}
                y={VIEW_H - 10}
                fontSize={11}
                textAnchor="middle"
                className="fill-muted-foreground tabular-nums"
              >
                {formatWindowMinute(minute)}
              </text>
            </g>
          ))}

          <g clipPath={`url(#${clipId})`}>
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

            {/* One marker per recorded minute — the click target */}
            {pointsInWindow.map((point) => {
              const top = Math.max(
                ...point.pmn.map((value, band) => (visibleBands[band] ? value : 0)),
                0,
              );
              const playing = playingMinute === point.minuteOfDay;
              const hovered = hover?.point.minuteOfDay === point.minuteOfDay;
              return (
                <circle
                  key={point.minuteOfDay}
                  cx={x(point.minuteOfDay)}
                  cy={y(top)}
                  r={playing ? 5 : hovered ? 4.5 : 3}
                  className={playing || hovered ? "fill-primary" : "fill-muted-foreground/50"}
                />
              );
            })}

            {/* Playing marker */}
            {playingMinute != null && playingMinute >= view.start && playingMinute <= windowEnd(view) ? (
              <line
                x1={x(playingMinute)}
                y1={PAD.top}
                x2={x(playingMinute)}
                y2={PAD.top + PLOT_H}
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={2}
                className="text-primary"
              />
            ) : null}

            {/* Hover crosshair */}
            {hover ? (
              <line
                x1={x(hover.point.minuteOfDay)}
                y1={PAD.top}
                x2={x(hover.point.minuteOfDay)}
                y2={PAD.top + PLOT_H}
                stroke="currentColor"
                strokeOpacity={0.55}
                strokeDasharray="3 3"
                className="text-foreground"
              />
            ) : null}
          </g>

          {pointsInWindow.length === 0 ? (
            <text
              x={PAD.left + PLOT_W / 2}
              y={PAD.top + PLOT_H / 2}
              fontSize={13}
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              {labels.empty}
            </text>
          ) : null}
        </svg>

        {hover ? (
          <div
            className="absolute top-1 z-10 min-w-40 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
            // `pointerEvents` inline: a global `[data-rk] *` rule outranks the
            // utility class, and a tooltip that takes the pointer would cancel
            // the hover it is describing.
            style={{ left: hover.xPx, pointerEvents: "none" }}
          >
            <p className="font-semibold tabular-nums text-foreground">
              {formatMinuteOfDay(hover.point.minuteOfDay)}
            </p>
            {onMinuteClick ? (
              <p className="mt-0.5 text-[11px] text-primary">
                {playingMinute === hover.point.minuteOfDay ? labels.stopHint : labels.playHint}
              </p>
            ) : null}
            <ul className="mt-1 space-y-0.5">
              {hover.point.pmn.map((value, band) =>
                visibleBands[band] ? (
                  <li key={band} className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: BAND_COLORS[band] }}
                    />
                    <span className="tabular-nums">
                      {props.bandLabels[band]}: {formatPmnValue(value)}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
