"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatSpeed = (n: number) => `${n}\u00d7`;

// Presentational dual-handle range scrubber that floats over the stream map.
// All the timing/animation logic lives in RecordMap; this component only draws
// the controls and forwards drag/click/play gestures back up. The live play
// head line and the head date/count readout are updated imperatively through
// the forwarded refs so the 60fps playback never re-renders React.

export type MapTimelineLabels = {
  play: string;
  pause: string;
  from: string;
  to: string;
  dragHint: string;
  speed: string;
};

export type DragMode = "start" | "end" | "band";

export function MapTimeline({
  disabled,
  playing,
  onTogglePlay,
  histo,
  maxBucket,
  winStart,
  winEnd,
  startLabel,
  endLabel,
  axisStartLabel,
  axisEndLabel,
  defaultHeadCount,
  startAria,
  endAria,
  speed,
  speedOptions,
  onSpeedChange,
  beginDrag,
  onTrackClick,
  trackRef,
  playheadElRef,
  headDateRef,
  headCountRef,
  labels,
}: {
  disabled: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  histo: number[];
  maxBucket: number;
  winStart: number;
  winEnd: number;
  startLabel: string;
  endLabel: string;
  axisStartLabel: string;
  axisEndLabel: string;
  defaultHeadCount: string;
  startAria: string;
  endAria: string;
  speed: number;
  speedOptions: number[];
  onSpeedChange: (speed: number) => void;
  beginDrag: (mode: DragMode) => (e: ReactPointerEvent) => void;
  onTrackClick: (e: ReactMouseEvent) => void;
  trackRef: RefObject<HTMLDivElement | null>;
  playheadElRef: RefObject<HTMLDivElement | null>;
  headDateRef: RefObject<HTMLSpanElement | null>;
  headCountRef: RefObject<HTMLSpanElement | null>;
  labels: MapTimelineLabels;
}) {
  const pct = (n: number) => `${n * 100}%`;
  const buckets = histo.length || 1;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] p-3">
      <div className="pointer-events-auto mx-auto flex max-w-[820px] flex-col gap-2.5 rounded-2xl border border-border-soft bg-background/92 px-3.5 py-3 shadow-sm backdrop-blur">
        {/* Top row: play + the From / playhead / To readout */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={disabled}
            aria-label={playing ? labels.pause : labels.play}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-[11.5px]">
            <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-foreground/45">{labels.from}</span>
              <span className="font-medium tabular-nums text-foreground/80">{startLabel}</span>
            </span>
            <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-center">
              <span ref={headDateRef} className="font-medium tabular-nums text-primary">
                {endLabel}
              </span>
              <span ref={headCountRef} className="hidden tabular-nums text-foreground/40 sm:inline">
                {defaultHeadCount}
              </span>
            </span>
            <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-foreground/45">{labels.to}</span>
              <span className="font-medium tabular-nums text-foreground/80">{endLabel}</span>
            </span>
          </div>

          {/* Playback-speed selector (YouTube-style) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={labels.speed}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-border-soft bg-surface px-2.5 text-[11.5px] font-medium tabular-nums text-foreground/75 transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {formatSpeed(speed)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="z-[1000] min-w-[6rem]">
              <DropdownMenuRadioGroup
                value={String(speed)}
                onValueChange={(value) => onSpeedChange(Number(value))}
              >
                {speedOptions.map((option) => (
                  <DropdownMenuRadioItem key={option} value={String(option)} className="tabular-nums">
                    {formatSpeed(option)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* The dual-handle range track with density histogram behind it */}
        <div
          ref={trackRef}
          onClick={onTrackClick}
          className="gf-tl relative h-[44px] w-full touch-none select-none"
        >
          <div className="absolute inset-0 flex items-end gap-[1.5px] overflow-hidden rounded-md">
            {histo.map((c, i) => {
              const center = (i + 0.5) / buckets;
              const inRange = center >= winStart && center <= winEnd;
              return (
                <span
                  key={i}
                  className="gf-tl-bar"
                  data-in={inRange ? "true" : "false"}
                  style={{ height: `${8 + (c / maxBucket) * 92}%` }}
                />
              );
            })}
          </div>
          {/* Dimmed regions outside the selection */}
          <div className="gf-tl-mask" style={{ left: 0, width: pct(winStart) }} />
          <div className="gf-tl-mask" style={{ left: pct(winEnd), right: 0 }} />
          {/* Selected band (drag to shift the whole window) */}
          <div
            className="gf-tl-band"
            style={{ left: pct(winStart), width: pct(Math.max(0, winEnd - winStart)) }}
            onPointerDown={beginDrag("band")}
            role="presentation"
          />
          {/* Live playhead line */}
          <div ref={playheadElRef} className="gf-tl-head" style={{ left: "100%" }} />
          {/* Handles */}
          <button
            type="button"
            className="gf-tl-handle"
            style={{ left: pct(winStart) }}
            onPointerDown={beginDrag("start")}
            aria-label={startAria}
          />
          <button
            type="button"
            className="gf-tl-handle"
            style={{ left: pct(winEnd) }}
            onPointerDown={beginDrag("end")}
            aria-label={endAria}
          />
        </div>

        {/* Axis ends + hint */}
        <div className="flex items-center justify-between text-[10.5px] text-foreground/40">
          <span className="tabular-nums">{axisStartLabel}</span>
          <span className="hidden sm:inline">{labels.dragHint}</span>
          <span className="tabular-nums">{axisEndLabel}</span>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
