"use client";

/**
 * The one spectrogram surface used across the whole app.
 *
 * Every place that shows a recording's frequency-over-time picture renders
 * through this component — the feed clip, the recordings list seek strip, the
 * AudioMoth labelling workspace and the upload preview. Consolidating them
 * here means one behaviour everywhere: in particular, clicking anywhere on the
 * picture reports the time you pointed at (`onSeek`), so a caller with an audio
 * element can jump straight to that moment. The component itself owns no audio;
 * it draws the picture, the playhead and any overlays, and translates pointer
 * positions into 0–1 fractions.
 *
 * Two visual sources are supported and look identical:
 *   • `image` — a pre-rendered spectrogram PNG (a PDS blob), shown as an <img>.
 *   • `data`  — freshly computed FFT magnitudes, painted to a <canvas> here
 *               with the same inferno colour map the stored PNGs use.
 *
 * Interaction:
 *   • Pass `onSeek` for click-to-scrub. A click reports the x fraction (0 =
 *     start, 1 = end). By default the click is stopped from bubbling so a
 *     surrounding row (e.g. a selectable list item) doesn't also react.
 *   • Pass `draw` to additionally let the user drag a labelling box. A drag
 *     reports the box; a plain click (no drag) still falls through to `onSeek`,
 *     so the labelling workspace can both draw and scrub without a stray seek.
 */

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { colorForSpectrogram, type SpectrogramData } from "@/app/_lib/audiomoth/spectrogram";
import { normalizeSpectrogramBox, type NormalizedSpectrogramBox } from "@/app/_lib/audiomoth/labels";
import { cn } from "@/lib/utils";

/** dBFS window the stored PNGs are painted with (MIN_DB −100 … MAX_DB −20). */
const DB_FLOOR = 100;
const DB_SPAN = 80;
/** Below this pointer travel a gesture counts as a click, not a drag. */
const DRAG_THRESHOLD = 0.01;
/** Boxes smaller than this in either axis are discarded as accidental taps. */
const DEFAULT_MIN_BOX = 0.01;

export type SpectrogramSource =
  | { kind: "image"; url: string }
  | { kind: "data"; data: SpectrogramData }
  | { kind: "pending" }
  | { kind: "failed" };

export type SpectrogramDraw = {
  /** Live draft as the pointer drags (null clears it). */
  onDraftChange: (box: NormalizedSpectrogramBox | null) => void;
  /** Final box on release (null when the drag was too small to keep). */
  onCommit: (box: NormalizedSpectrogramBox | null) => void;
  /** Smallest box kept, as a 0–1 fraction of each axis. */
  minBoxSize?: number;
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function Spectrogram({
  source,
  onSeek,
  draw,
  playheadFraction = null,
  grid = false,
  stopPropagationOnSeek = true,
  className,
  style,
  imageClassName,
  imageAlt = "",
  ariaLabel,
  loadingLabel,
  failedLabel,
  children,
}: {
  source: SpectrogramSource;
  /** Click-to-scrub: reports the pointed-at time as a 0–1 fraction. */
  onSeek?: (fraction: number) => void;
  /** Enables drag-to-draw labelling on top of click-to-scrub. */
  draw?: SpectrogramDraw;
  /** 0–1 position of the playhead line; null hides it. */
  playheadFraction?: number | null;
  /** Faint quarter grid, used by the labelling workspace. */
  grid?: boolean;
  /** Stop a seek click from bubbling to a surrounding handler. */
  stopPropagationOnSeek?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Object-fit etc. for the <img> source. Defaults to filling the box. */
  imageClassName?: string;
  imageAlt?: string;
  ariaLabel?: string;
  /** Text under the spinner while `source.kind === "pending"`. */
  loadingLabel?: string;
  /** Text shown when `source.kind === "failed"`. */
  failedLabel?: string;
  /** Overlays drawn above the picture (label boxes, the draft box). */
  children?: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gestureRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const data = source.kind === "data" ? source.data : null;

  // Paint computed magnitudes with the same colour map the stored PNGs use, so
  // a freshly computed spectrogram is indistinguishable from a loaded one.
  useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas || data.columns < 1 || data.bins < 1) return;
    canvas.width = data.columns;
    canvas.height = data.bins;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(data.columns, data.bins);
    for (let column = 0; column < data.columns; column += 1) {
      for (let bin = 0; bin < data.bins; bin += 1) {
        const [red, green, blue] = colorForSpectrogram((data.magnitudesDb[column * data.bins + bin]! + DB_FLOOR) / DB_SPAN);
        // Flip vertically: bin 0 (lowest frequency) sits at the bottom row.
        const offset = ((data.bins - 1 - bin) * data.columns + column) * 4;
        image.data[offset] = Math.round(red);
        image.data[offset + 1] = Math.round(green);
        image.data[offset + 2] = Math.round(blue);
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [data]);

  const pointFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height),
    };
  };

  const interactive = Boolean(onSeek || draw) && source.kind !== "pending" && source.kind !== "failed";

  // Drawing mode: track the drag so a plain click still scrubs.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draw || !interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    gestureRef.current = { startX: point.x, startY: point.y, moved: false };
    draw.onDraftChange(normalizeSpectrogramBox(point.x, point.y, point.x, point.y));
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!draw || !gesture) return;
    const point = pointFromEvent(event);
    if (Math.abs(point.x - gesture.startX) > DRAG_THRESHOLD || Math.abs(point.y - gesture.startY) > DRAG_THRESHOLD) {
      gesture.moved = true;
    }
    draw.onDraftChange(normalizeSpectrogramBox(gesture.startX, gesture.startY, point.x, point.y));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!draw || !gesture) return;
    gestureRef.current = null;
    const point = pointFromEvent(event);
    if (gesture.moved) {
      const box = normalizeSpectrogramBox(gesture.startX, gesture.startY, point.x, point.y);
      const minBox = draw.minBoxSize ?? DEFAULT_MIN_BOX;
      draw.onCommit(box.endX - box.startX < minBox || box.bottomY - box.topY < minBox ? null : box);
      return;
    }
    // A tap, not a drag: clear the draft and scrub to where they pointed.
    draw.onDraftChange(null);
    if (onSeek) {
      event.preventDefault();
      if (stopPropagationOnSeek) event.stopPropagation();
      onSeek(point.x);
    }
  };
  const onPointerCancel = () => {
    if (gestureRef.current && draw) draw.onDraftChange(null);
    gestureRef.current = null;
  };

  // Seek-only mode uses a click (not pointer) so a scroll-drag never scrubs.
  const onClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draw || !onSeek || !interactive) return;
    event.preventDefault();
    if (stopPropagationOnSeek) event.stopPropagation();
    onSeek(pointFromEvent(event).x);
  };

  return (
    <div
      ref={surfaceRef}
      className={cn("relative overflow-hidden", interactive && (draw ? "touch-none select-none" : "cursor-pointer"), className)}
      style={style}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
    >
      {source.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- spectrogram PNGs live on arbitrary PDS hosts
        <img src={source.url} alt={imageAlt} loading="lazy" className={cn("h-full w-full object-fill", imageClassName)} />
      ) : (
        <canvas ref={canvasRef} className={cn("h-full w-full", source.kind !== "data" && "opacity-0", imageClassName)} aria-hidden />
      )}

      {grid ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_24.8%,rgba(255,255,255,.08)_25%,transparent_25.2%,transparent_49.8%,rgba(255,255,255,.08)_50%,transparent_50.2%,transparent_74.8%,rgba(255,255,255,.08)_75%,transparent_75.2%),linear-gradient(to_bottom,transparent_24.8%,rgba(255,255,255,.08)_25%,transparent_25.2%,transparent_49.8%,rgba(255,255,255,.08)_50%,transparent_50.2%,transparent_74.8%,rgba(255,255,255,.08)_75%,transparent_75.2%)]" />
      ) : null}

      {children}

      {playheadFraction !== null && playheadFraction !== undefined ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-30 w-px bg-white/85 shadow-[0_0_7px_rgba(255,255,255,.7)]"
          style={{ left: `${clampUnit(playheadFraction) * 100}%` }}
        />
      ) : null}

      {source.kind === "pending" ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/40 text-center text-sm text-white/70 backdrop-blur-sm">
          <span>
            <Loader2Icon className="mx-auto size-5 animate-spin text-white/80" aria-hidden />
            {loadingLabel ? <span className="mt-2 block">{loadingLabel}</span> : null}
          </span>
        </div>
      ) : null}

      {source.kind === "failed" ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#080611] px-6 text-center text-sm text-white/60">
          {failedLabel}
        </div>
      ) : null}
    </div>
  );
}
