"use client";

/**
 * In-feed preview for a bioacoustic sighting: the labelled section of an
 * audio recording, shown as the recording's stored spectrogram with the
 * occurrence's time × frequency box drawn on top, plus one-tap playback of
 * exactly that sound.
 *
 * The occurrence's `gainforestBioacoustics` sidecar (parsed server-side into
 * `item.bioacoustics`) points at the source `app.gainforest.ac.audio` record.
 * That record is read straight from its owner's PDS — the same public,
 * CORS-open trust model as blob fetching — and carries the spectrogram PNG
 * blob, the playable preview blob / archival URL, and the duration +
 * sample-rate needed to place the box.
 *
 * Not every recording stored a spectrogram blob (e.g. sounds imported before
 * spectrograms were saved). For those the card computes one client-side from
 * the audio itself — the same FFT pipeline the AudioMoth labelling workspace
 * uses — lazily, only once the card scrolls into view.
 */

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PauseIcon, PlayIcon, WavesIcon } from "lucide-react";
import type { FeedBioacousticsClip } from "../_lib/feed";
import type { AudioLabelCategory } from "../_lib/audiomoth/labels";
import { pauseOtherAudio } from "../_lib/audio-coordinator";
import { colorForSpectrogram, computeSpectrogram } from "../_lib/audiomoth/spectrogram";
import { blobUrl, getPdsRecord, parseAtUri, resolvePdsHost } from "../_lib/pds";
import { cn } from "@/lib/utils";

/** FFT settings for the client-side fallback spectrogram — a lighter pass
 *  than the labelling workspace (the feed card is small and read-only). */
const FALLBACK_FFT_SIZE = 512;
const FALLBACK_MAX_COLUMNS = 800;

/** Box + chip tints per label category — mirrors the labelling workspace. */
const CATEGORY_STYLES: Record<AudioLabelCategory, { box: string; chip: string }> = {
  bird: { box: "border-emerald-300 bg-emerald-300/20", chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  frog: { box: "border-cyan-300 bg-cyan-300/20", chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300" },
  insect: { box: "border-amber-300 bg-amber-300/20", chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  other: { box: "border-violet-300 bg-violet-300/20", chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  note: { box: "border-slate-200 bg-slate-200/20", chip: "bg-slate-500/12 text-slate-700 dark:text-slate-300" },
};

type SourceAudio = {
  /** Spectrogram PNG of the whole recording, when the record stored one. */
  spectrogramUrl: string | null;
  /** Playable URLs, best first (compact PDS preview, then archival original). */
  audioUrls: string[];
  /** Full recording duration in seconds, when known from metadata. */
  durationSeconds: number | null;
  /** Highest frequency the spectrogram covers (sampleRate / 2), when known. */
  nyquistHz: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** CID of a `{ file: blob }` (or bare blob) field on an ac.audio record. */
function blobCid(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const file = isRecord(value.file) ? value.file : value;
  if (!isRecord(file) || !isRecord(file.ref) || typeof file.ref.$link !== "string") return null;
  return file.ref.$link;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function formatFrequency(hz: number): string {
  return hz >= 1_000 ? `${(hz / 1_000).toFixed(hz >= 10_000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Load the source ac.audio record and derive everything the card needs. */
async function loadSourceAudio(audioUri: string, signal: AbortSignal): Promise<SourceAudio | null> {
  const parts = parseAtUri(audioUri);
  if (!parts) return null;
  const [host, record] = await Promise.all([
    resolvePdsHost(parts.did, signal),
    getPdsRecord(parts.did, parts.collection, parts.rkey, signal),
  ]);
  if (!host || !record) return null;
  const value = record.value;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const duration = typeof metadata.duration === "string" ? Number(metadata.duration) : null;
  const sampleRate = typeof metadata.sampleRate === "number" ? metadata.sampleRate : null;
  const spectrogramCid = blobCid(value.spectrogram);
  const previewCid = blobCid(value.blob);
  const audioUrls = [
    previewCid ? blobUrl(host, parts.did, previewCid) : null,
    typeof value.accessUri === "string" && value.accessUri.trim() ? value.accessUri : null,
  ].filter((url): url is string => Boolean(url));
  return {
    spectrogramUrl: spectrogramCid ? blobUrl(host, parts.did, spectrogramCid) : null,
    audioUrls,
    durationSeconds: duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null,
    nyquistHz: sampleRate && sampleRate > 0 ? sampleRate / 2 : null,
  };
}

export function FeedAudioClip({ clip }: { clip: FeedBioacousticsClip }) {
  const t = useTranslations("common.feed.audio");
  const tCategories = useTranslations("common.audiomoth.label.categories");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [source, setSource] = useState<SourceAudio | null | undefined>(undefined);
  // Lazy trigger for the computed fallback: only decode audio once the card
  // has actually scrolled into (or near) the viewport.
  const [inView, setInView] = useState(false);
  const [fallback, setFallback] = useState<"pending" | "done" | "failed" | null>(null);
  // Nyquist measured from the decoded audio — authoritative when we computed
  // the spectrogram ourselves.
  const [computedNyquist, setComputedNyquist] = useState<number | null>(null);
  // Duration measured by the <audio> element — fills in when metadata lacks it.
  const [measuredDuration, setMeasuredDuration] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  // Walks the playable-URL list when a source errors (preview → archival).
  const [audioIndex, setAudioIndex] = useState(0);

  useEffect(() => {
    setSource(undefined);
    setAudioIndex(0);
    setAudioFailed(false);
    setFallback(null);
    setComputedNyquist(null);
    const controller = new AbortController();
    loadSourceAudio(clip.audioUri, controller.signal)
      .then((next) => setSource(next))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setSource(null);
      });
    return () => controller.abort();
  }, [clip.audioUri]);

  // Watch for the card entering the viewport (once), so the computed fallback
  // below never decodes audio for rows far offscreen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Computed fallback: when the record stored no spectrogram PNG, build one
  // from the playable audio (decode → Hann/FFT magnitudes → inferno colours),
  // exactly like the labelling workspace but at a lighter resolution.
  useEffect(() => {
    if (!inView || !source || source.spectrogramUrl || source.audioUrls.length === 0) return;
    let cancelled = false;
    setFallback("pending");

    async function render() {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("unsupported");
      const context = new AudioContextClass();
      try {
        let buffer: AudioBuffer | null = null;
        for (const candidate of source!.audioUrls) {
          try {
            const response = await fetch(candidate);
            if (!response.ok) continue;
            buffer = await context.decodeAudioData(await response.arrayBuffer());
            break;
          } catch {
            /* Try the next playable URL. */
          }
        }
        if (!buffer || cancelled) {
          if (!buffer) throw new Error("audio_load_failed");
          return;
        }
        const channel = buffer.getChannelData(0);
        const samples = new Int16Array(channel.length);
        for (let index = 0; index < channel.length; index += 1) {
          samples[index] = Math.round(Math.max(-1, Math.min(1, channel[index]!)) * 32_767);
        }
        const hopSize = Math.max(
          256,
          Math.ceil(Math.max(1, samples.length - FALLBACK_FFT_SIZE) / FALLBACK_MAX_COLUMNS),
        );
        const data = computeSpectrogram(samples, { fftSize: FALLBACK_FFT_SIZE, hopSize });
        const canvas = canvasRef.current;
        if (!canvas || data.columns < 2) throw new Error("empty");
        if (cancelled) return;
        canvas.width = data.columns;
        canvas.height = data.bins;
        const paint = canvas.getContext("2d");
        if (!paint) throw new Error("canvas");
        const image = paint.createImageData(data.columns, data.bins);
        for (let column = 0; column < data.columns; column += 1) {
          for (let bin = 0; bin < data.bins; bin += 1) {
            const [red, green, blue] = colorForSpectrogram(
              (data.magnitudesDb[column * data.bins + bin]! + 100) / 80,
            );
            const offset = ((data.bins - 1 - bin) * data.columns + column) * 4;
            image.data[offset] = Math.round(red);
            image.data[offset + 1] = Math.round(green);
            image.data[offset + 2] = Math.round(blue);
            image.data[offset + 3] = 255;
          }
        }
        paint.putImageData(image, 0, 0);
        setComputedNyquist(buffer.sampleRate / 2);
        setMeasuredDuration(buffer.duration);
        setFallback("done");
      } finally {
        void context.close();
      }
    }

    void render().catch(() => {
      if (!cancelled) setFallback("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [inView, source]);

  const duration = source?.durationSeconds ?? measuredDuration;
  const nyquist = computedNyquist ?? source?.nyquistHz ?? null;
  const styles = CATEGORY_STYLES[clip.category] ?? CATEGORY_STYLES.other;

  // Where the labelled section sits on the full spectrogram, as fractions.
  const box = useMemo(() => {
    if (!duration || duration <= 0) return null;
    const top = nyquist && nyquist > 0 ? 1 - clip.maxFrequencyHz / nyquist : 0;
    const bottom = nyquist && nyquist > 0 ? 1 - clip.minFrequencyHz / nyquist : 1;
    const left = clampFraction(clip.startTimeSeconds / duration);
    const right = clampFraction(clip.endTimeSeconds / duration);
    return {
      left: left * 100,
      width: Math.max(0.5, (right - left) * 100),
      top: clampFraction(top) * 100,
      height: Math.max(2, (clampFraction(bottom) - clampFraction(top)) * 100),
    };
  }, [clip, duration, nyquist]);

  const audioUrl = source?.audioUrls[audioIndex] ?? null;
  const canPlay = Boolean(audioUrl) && !audioFailed;

  // Nothing useful to show — keep the row clean instead of an empty shell.
  if (source === null || (source && !source.spectrogramUrl && source.audioUrls.length === 0)) return null;

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    if (playing) {
      audio.pause();
      return;
    }
    // (Re)start from the beginning of the labelled section when the playhead
    // sits outside it; otherwise resume where the listener paused.
    if (audio.currentTime < clip.startTimeSeconds || audio.currentTime >= clip.endTimeSeconds - 0.05) {
      audio.currentTime = clip.startTimeSeconds;
    }
    pauseOtherAudio(audio);
    void audio.play().catch(() => setAudioFailed(true));
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlayhead(audio.currentTime);
    // Segment playback: stop at the end of the labelled section.
    if (audio.currentTime >= clip.endTimeSeconds) {
      audio.pause();
      audio.currentTime = clip.startTimeSeconds;
      setPlayhead(null);
    }
  };

  const showPlayhead = playing && playhead !== null && duration && duration > 0;
  const computingFallback = Boolean(
    source && !source.spectrogramUrl && source.audioUrls.length > 0 && fallback !== "done" && fallback !== "failed",
  );

  return (
    <div ref={containerRef} className="mt-2 overflow-hidden rounded-xl border border-border/60">
      {/* Spectrogram of the whole recording with the labelled box on top. */}
      <div className="relative h-32 w-full bg-[#06040b] sm:h-36">
        {/* Backdrop for loading / failed states. */}
        <div className="absolute inset-0 bg-linear-to-b from-[#1a1430] via-[#0d0a18] to-[#06040b]" aria-hidden />
        {source?.spectrogramUrl ? (
          <Image
            src={source.spectrogramUrl}
            alt={t("spectrogramAlt")}
            fill
            unoptimized
            sizes="(max-width: 672px) 100vw, 608px"
            className="object-fill"
          />
        ) : (
          /* Client-computed fallback spectrogram, painted once decoded. */
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t("spectrogramAlt")}
            className={cn("relative h-full w-full", fallback !== "done" && "opacity-0")}
          />
        )}
        {source === undefined || computingFallback ? (
          <div className="absolute inset-0 grid place-items-center text-white/60">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          </div>
        ) : null}
        {box ? (
          <span
            aria-hidden
            className={cn("absolute z-10 border-2", styles.box)}
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
          />
        ) : null}
        {showPlayhead ? (
          <span
            aria-hidden
            className="absolute inset-y-0 z-20 w-px bg-white/80 shadow-[0_0_7px_rgba(255,255,255,.7)]"
            style={{ left: `${clampFraction((playhead ?? 0) / (duration ?? 1)) * 100}%` }}
          />
        ) : null}
      </div>

      {/* Play control + what the box says. */}
      <div className="flex items-center gap-2.5 border-t border-border/60 bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePlayback();
          }}
          disabled={!canPlay}
          aria-label={playing ? t("pause") : t("play")}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5 translate-x-px" />}
        </button>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", styles.chip)}>
          <WavesIcon className="size-3" aria-hidden />
          {tCategories(clip.category)}
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {formatTime(clip.startTimeSeconds)}–{formatTime(clip.endTimeSeconds)} · {formatFrequency(clip.minFrequencyHz)}–{formatFrequency(clip.maxFrequencyHz)}
        </span>
        {audioFailed || (source && source.audioUrls.length === 0) ? (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{t("unavailable")}</span>
        ) : null}
      </div>

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="none"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setMeasuredDuration(value);
          }}
          onError={() => {
            // Fall back to the next playable URL; give up after the last one.
            if (source && audioIndex < source.audioUrls.length - 1) setAudioIndex(audioIndex + 1);
            else setAudioFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}
