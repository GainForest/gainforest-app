"use client";

/**
 * The compact soundscape card — the calm form a published soundscape takes
 * inside a feed post or an evidence timeline entry.
 *
 * Where the full explorer (PublishedSoundscapeView, on the permalink page)
 * offers zooming, band toggles and a recordings list, the card offers a
 * glance and a tap: smoothed per-band outlines around a small dial, four
 * hour marks, a needle showing what's playing, and one player bar.
 * Tap the ring to listen to that time of day; open the permalink to explore.
 *
 * Audio is resolved lazily per tap from the owner's PDS (compact preview
 * blob first) — same trust model as the explorer, nothing fetched until a
 * reader asks to listen.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRightIcon, Loader2Icon, PauseIcon, PlayIcon } from "lucide-react";
import { registerAudioElement, playExclusiveAudio } from "@/app/_lib/audio-coordinator";
import { resolvePlayableRecording } from "@/app/_lib/soundscape-record";
import { FREQUENCY_BANDS, formatBandRange } from "@/lib/soundscape/analysis";
import { formatMinuteOfDay } from "@/lib/soundscape/audiomoth";
import { cardOutline, formatCardDateRange, nearestSource } from "@/lib/soundscape/card";
import {
  soundscapeDates,
  type PublishedSoundscape,
  type SoundscapeSource,
} from "@/lib/soundscape/record";
import { cn } from "@/lib/utils";

/** Muted band palette for the card (the explorer keeps the vivid figures).
 *  Exported so the explore gallery's shared voice-group key can swatch with
 *  the exact colours the dials use. */
export const CARD_BAND_COLORS = ["#4a6b8a", "#4a7a5a", "#c9a227", "#b05a4a", "#7a6aab"] as const;

const SIZE = 320;
const CENTER = SIZE / 2;
const OUTER = 138;
/** Radius where a PMN of zero sits — values grow outward from here. */
const BASE = 52;

function polar(minuteOfDay: number, radius: number): { x: number; y: number } {
  // Same orientation as the full clock: 00:00 at the right, clockwise.
  const angle = (minuteOfDay / 1440) * 2 * Math.PI;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

type PlayerState = {
  audioUri: string;
  minuteOfDay: number;
  status: "loading" | "playing" | "paused";
};

export function SoundscapeCard({
  soundscape,
  href,
  className,
  legend = true,
  showHeader = true,
  showFooter = true,
  compact = false,
}: {
  soundscape: PublishedSoundscape;
  /** Permalink of the published soundscape (the "open" link target). */
  href: string;
  className?: string;
  /** Show the in-card band legend. The explore gallery passes false and
   *  draws one shared voice-group key for the whole page instead, so a grid
   *  of dials doesn't repeat the same five lines beside every card. */
  legend?: boolean;
  /** The project-row slot supplies its own header and title. */
  showHeader?: boolean;
  /** The project-row slot supplies its own single action. */
  showFooter?: boolean;
  /** Remove the card chrome when it is nested inside a project slot. */
  compact?: boolean;
}) {
  const t = useTranslations("common.soundscape");
  const locale = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  const bandCount = FREQUENCY_BANDS.length;
  const outline = useMemo(() => cardOutline(soundscape.sources, bandCount), [bandCount, soundscape.sources]);
  const dates = useMemo(() => soundscapeDates(soundscape.sources), [soundscape.sources]);
  const dateLabel = useMemo(() => formatCardDateRange(dates, locale), [dates, locale]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const point of outline) for (const value of point.pmn) max = Math.max(max, value);
    return max > 0 ? max : 1;
  }, [outline]);

  /** One closed-ish path per band through the bin outline. */
  const bandPaths = useMemo(() => {
    if (outline.length < 2) return [];
    return FREQUENCY_BANDS.map((_, band) => {
      const points = outline.map((point) => {
        const radius = BASE + ((point.pmn[band] ?? 0) / maxValue) * (OUTER - BASE - 6);
        return polar(point.minuteOfDay, radius);
      });
      const d = `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}`;
      // Close the loop only when the outline reaches around the clock;
      // a half-day soundscape stays an open arc.
      const span = outline[outline.length - 1].minuteOfDay - outline[0].minuteOfDay;
      return span > 1440 - 2 * (1440 / outline.length) ? `${d}Z` : d;
    });
  }, [maxValue, outline]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    return registerAudioElement(element);
  }, []);

  const stop = useCallback(() => {
    playTokenRef.current++;
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    setPlayer(null);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (source: SoundscapeSource) => {
      stop();
      setFailed(false);
      const token = ++playTokenRef.current;
      setPlayer({ audioUri: source.audioUri, minuteOfDay: source.minuteOfDay, status: "loading" });
      void (async () => {
        const playable = await resolvePlayableRecording(source.audioUri).catch(() => null);
        if (token !== playTokenRef.current) return;
        const element = audioRef.current;
        if (!playable || !element) {
          setPlayer(null);
          setFailed(true);
          return;
        }
        for (const url of playable.urls) {
          element.src = url;
          try {
            await playExclusiveAudio(element);
            if (token !== playTokenRef.current) return;
            setPlayer((current) =>
              current?.audioUri === source.audioUri ? { ...current, status: "playing" } : current,
            );
            return;
          } catch {
            if (token !== playTokenRef.current) return;
          }
        }
        setPlayer(null);
        setFailed(true);
      })();
    },
    [stop],
  );

  /** The player button: pause what's playing, resume what's paused, or start
   *  with the loudest moment of the whole soundscape. */
  const togglePlay = useCallback(() => {
    const element = audioRef.current;
    if (player?.status === "playing" && element) {
      element.pause();
      setPlayer({ ...player, status: "paused" });
      return;
    }
    if (player?.status === "paused" && element) {
      void playExclusiveAudio(element).catch(() => setFailed(true));
      setPlayer({ ...player, status: "playing" });
      return;
    }
    if (player?.status === "loading") return;
    let loudest: SoundscapeSource | null = null;
    let best = -Infinity;
    for (const source of soundscape.sources) {
      const sum = source.pmn.reduce((total, value) => total + value, 0);
      if (sum > best) {
        best = sum;
        loudest = source;
      }
    }
    if (loudest) play(loudest);
  }, [play, player, soundscape.sources]);

  /** Tap anywhere on the ring: play the recording closest to that time. */
  const handleDialClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * SIZE - CENTER;
      const y = ((event.clientY - rect.top) / rect.height) * SIZE - CENTER;
      const distance = Math.hypot(x, y);
      if (distance < BASE * 0.45 || distance > OUTER + 14) return;
      const minute = ((Math.atan2(y, x) / (2 * Math.PI)) * 1440 + 1440) % 1440;
      const source = nearestSource(soundscape.sources, minute);
      if (source) {
        if (player?.audioUri === source.audioUri && player.status !== "loading") stop();
        else play(source);
      }
    },
    [play, player, soundscape.sources, stop],
  );

  const needle = player ? polar(player.minuteOfDay, OUTER - 10) : null;
  const hourMarks = [
    { minute: 0, label: "00", dx: 12, dy: 4 },
    { minute: 360, label: "06", dx: 0, dy: 14 },
    { minute: 720, label: "12", dx: -13, dy: 4 },
    { minute: 1080, label: "18", dx: 0, dy: -8 },
  ];

  return (
    <div
      className={cn(
        compact
          ? "overflow-visible rounded-none border-0 bg-transparent"
          : "overflow-hidden rounded-xl border border-border/60 bg-background",
        className,
      )}
    >
      <audio
        ref={audioRef}
        preload="none"
        className="hidden"
        onEnded={() => {
          setPlayer(null);
          setProgress(0);
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setProgress(element.duration > 0 ? element.currentTime / element.duration : 0);
        }}
      />

      {/* Header */}
      {showHeader ? (
        <div className="flex items-baseline gap-3 px-4 pt-3.5 sm:px-5">
          <span className="font-instrument text-xl italic tracking-[-0.01em] text-foreground">
            {t("card.title")}
          </span>
          <span className="font-mono text-[12.5px] text-muted-foreground">{dateLabel}</span>
        </div>
      ) : null}

      {/* Dial + legend */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0 px-2 sm:px-4">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={t("card.dialAria")}
          onClick={handleDialClick}
          className={cn(
            "min-w-0 cursor-pointer select-none",
            legend ? "flex-1 basis-64" : cn("mx-auto w-full", compact ? "max-w-[300px]" : "max-w-[380px]"),
          )}
        >
          {/* Grid: outer circle + dotted rings */}
          <circle cx={CENTER} cy={CENTER} r={OUTER} fill="none" stroke="currentColor" strokeOpacity={0.18} className="text-muted-foreground" />
          {[0.4, 0.7].map((f) => (
            <circle
              key={f}
              cx={CENTER}
              cy={CENTER}
              r={BASE + f * (OUTER - BASE)}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.16}
              strokeDasharray="2 5"
              className="text-muted-foreground"
            />
          ))}
          {/* Hour marks */}
          {hourMarks.map((mark) => {
            const p = polar(mark.minute, OUTER + 1);
            return (
              <text
                key={mark.minute}
                x={p.x + mark.dx}
                y={p.y + mark.dy}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                fontSize={12}
              >
                {mark.label}
              </text>
            );
          })}
          {/* Band outlines */}
          {bandPaths.map((d, band) => (
            <path
              key={FREQUENCY_BANDS[band].id}
              d={d}
              fill="none"
              stroke={CARD_BAND_COLORS[band] ?? "#888"}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
          {/* Needle for the playing minute */}
          {needle ? (
            <g className="text-primary">
              <line
                x1={CENTER}
                y1={CENTER}
                x2={needle.x}
                y2={needle.y}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle cx={needle.x} cy={needle.y} r={7} fill="currentColor" />
            </g>
          ) : null}
        </svg>

        {legend ? (
          <ul className="shrink-0 basis-40 space-y-2.5 px-2 py-3">
            <li className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("chart.legendTitle")}
            </li>
            {FREQUENCY_BANDS.map((band, index) => (
              <li key={band.id} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-[7px] inline-block h-[2.5px] w-5 shrink-0 rounded-full"
                  style={{ backgroundColor: CARD_BAND_COLORS[index] }}
                />
                <span className="min-w-0 leading-tight">
                  <span className="block text-[13.5px] text-foreground">{t(`bands.${band.labelKey}`)}</span>
                  <span className="block font-mono text-[11.5px] text-muted-foreground">
                    {formatBandRange(band, soundscape.ceilingHz)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Player bar */}
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-full bg-muted/60 py-2 pl-2 pr-4 sm:mx-5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={player?.status === "playing" ? t("card.pause") : t("card.play")}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        >
          {player?.status === "loading" ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : player?.status === "playing" ? (
            <PauseIcon className="size-4 fill-current" />
          ) : (
            <PlayIcon className="ml-0.5 size-4 fill-current" />
          )}
        </button>
        {player ? (
          <span className="shrink-0 font-mono text-[13.5px] tabular-nums text-foreground">
            {formatMinuteOfDay(player.minuteOfDay)}
          </span>
        ) : null}
        <div className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-border/80">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className={cn("shrink-0 text-[12.5px]", failed ? "text-destructive" : "text-muted-foreground")}>
          {failed ? t("chart.playError") : t("card.tapHint")}
        </span>
      </div>

      {/* Footer */}
      {showFooter ? (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 sm:px-5">
          <span className="font-mono text-[12.5px] text-muted-foreground">
            {t("zoom.recordingsCount", { count: soundscape.sources.length })}
          </span>
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-primary hover:underline"
          >
            {t("published.openFull")}
            <ArrowUpRightIcon className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
