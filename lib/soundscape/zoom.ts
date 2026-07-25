/**
 * Time-window maths for the soundscape detail view — the strip under the
 * 24-hour clock that can be zoomed down to a single minute.
 *
 * Pure (no React, no DOM) so it can be unit tested; the component in
 * app/soundscape/_components/SoundscapeZoom.tsx owns the interaction state.
 *
 * A window never wraps past midnight: it is always a plain
 * `[start, start + span]` slice of the 0..1440 dial, which keeps the maths
 * (and the axis) honest at every zoom level.
 */

import { formatMinuteOfDay } from "./audiomoth";

export const MINUTES_PER_DAY = 1440;

/**
 * Tightest zoom: a quarter of an hour spread around the dial. Less than this
 * and a sparse schedule leaves too few points to read as a ring.
 */
export const MIN_WINDOW_SPAN = 15;

/** How far apart two points may be before a band line is broken. */
export const SERIES_GAP_MINUTES = 90;

export type TimeWindow = {
  /** Minutes since midnight of the left edge (0..1440 - span). */
  start: number;
  /** Width of the window in minutes (MIN_WINDOW_SPAN..1440). */
  span: number;
};

export const FULL_DAY_WINDOW: TimeWindow = { start: 0, span: MINUTES_PER_DAY };

/** Keeps a window inside the day and within the allowed zoom range. */
export function clampWindow(window: TimeWindow): TimeWindow {
  const rawSpan = Number.isFinite(window.span) ? window.span : MINUTES_PER_DAY;
  const span = Math.min(MINUTES_PER_DAY, Math.max(MIN_WINDOW_SPAN, Math.round(rawSpan)));
  const rawStart = Number.isFinite(window.start) ? window.start : 0;
  const start = Math.min(MINUTES_PER_DAY - span, Math.max(0, Math.round(rawStart)));
  return { start, span };
}

export function windowEnd(window: TimeWindow): number {
  return window.start + window.span;
}

export function isFullDay(window: TimeWindow): boolean {
  return clampWindow(window).span >= MINUTES_PER_DAY;
}

export function isInWindow(minuteOfDay: number, window: TimeWindow): boolean {
  return minuteOfDay >= window.start && minuteOfDay <= windowEnd(window);
}

/** 0 at the left edge of the window, 1 at the right edge. */
export function windowFraction(minuteOfDay: number, window: TimeWindow): number {
  return (minuteOfDay - window.start) / window.span;
}

/** Inverse of `windowFraction` — used to turn a cursor position into a time. */
export function minuteAtFraction(fraction: number, window: TimeWindow): number {
  return window.start + fraction * window.span;
}

/**
 * Zooms by `factor` (< 1 zooms in) keeping `focusMinute` — the time under the
 * cursor, or the middle of the window — pinned in place, so zooming feels
 * like a map rather than a jump.
 */
export function zoomWindow(window: TimeWindow, factor: number, focusMinute?: number): TimeWindow {
  const current = clampWindow(window);
  const middle = current.start + current.span / 2;
  const focus = Math.min(
    windowEnd(current),
    Math.max(current.start, Number.isFinite(focusMinute ?? NaN) ? focusMinute! : middle),
  );
  const ratio = current.span === 0 ? 0.5 : (focus - current.start) / current.span;
  const span = Math.min(MINUTES_PER_DAY, Math.max(MIN_WINDOW_SPAN, current.span * factor));
  return clampWindow({ start: focus - ratio * span, span });
}

/** Slides the window by `deltaMinutes` without changing the zoom level. */
export function panWindow(window: TimeWindow, deltaMinutes: number): TimeWindow {
  const current = clampWindow(window);
  return clampWindow({ start: current.start + deltaMinutes, span: current.span });
}

/** Re-centres the window on a minute, keeping the current zoom level. */
export function centerWindow(window: TimeWindow, minuteOfDay: number): TimeWindow {
  const current = clampWindow(window);
  return clampWindow({ start: minuteOfDay - current.span / 2, span: current.span });
}

/** Like `formatMinuteOfDay`, but the end of the day reads 24:00, not 00:00. */
export function formatWindowMinute(minuteOfDay: number): string {
  return minuteOfDay >= MINUTES_PER_DAY ? "24:00" : formatMinuteOfDay(minuteOfDay);
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720];

/**
 * Axis tick spacing for a span: the smallest "round" step that keeps the
 * number of labels readable (at most ~12 across the strip).
 */
export function tickStepMinutes(span: number, maxTicks = 12): number {
  for (const step of TICK_STEPS) {
    if (span / step <= maxTicks) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

/** Tick minutes inside the window, aligned to whole steps. */
export function windowTicks(window: TimeWindow, maxTicks = 12): number[] {
  const current = clampWindow(window);
  const step = tickStepMinutes(current.span, maxTicks);
  const first = Math.ceil(current.start / step) * step;
  const ticks: number[] = [];
  for (let minute = first; minute <= windowEnd(current); minute += step) {
    ticks.push(minute);
  }
  return ticks;
}
