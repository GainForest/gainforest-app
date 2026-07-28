"use client";

/**
 * A published soundscape, drawn from a record instead of from a browser-local
 * analysis cache. This is the shape a soundscape takes once it leaves the
 * workbench: in a feed post, on a project's evidence timeline, and on its own
 * permalink page.
 *
 * Everything needed to draw the dial is already in the record, so the chart
 * appears instantly for any reader — signed in or not. Audio is the expensive
 * part, so it stays lazy: clicking a time resolves *that* recording's
 * `ac.audio` record from the owner's PDS and plays its compact preview blob.
 * Nothing is downloaded until somebody asks to listen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  Volume2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinuteOfDay } from "@/lib/soundscape/audiomoth";
import { FREQUENCY_BANDS, formatBandRange } from "@/lib/soundscape/analysis";
import {
  formatSoundscapeDateRange,
  soundscapePoints,
  sourceForMinute,
  type PublishedSoundscape,
  type SoundscapeSource,
} from "@/lib/soundscape/record";
import {
  FULL_DAY_WINDOW,
  isFullDay,
  isInWindow,
  panWindow,
  windowEnd,
  windowFraction,
  zoomWindow,
  formatWindowMinute,
  type TimeWindow,
} from "@/lib/soundscape/zoom";
import { resolvePlayableRecording } from "@/app/_lib/soundscape-record";
import { registerAudioElement, playExclusiveAudio } from "@/app/_lib/audio-coordinator";
import { cn } from "@/lib/utils";
import { BAND_COLORS, SoundscapeClock } from "./SoundscapeClock";

/** One notch of the zoom buttons — matches the workbench dial. */
const ZOOM_STEP = 1.6;

type PlayerState = {
  audioUri: string;
  minuteOfDay: number;
  name: string;
  status: "loading" | "playing";
};

export function PublishedSoundscapeView({
  soundscape,
  className,
}: {
  soundscape: PublishedSoundscape;
  className?: string;
}) {
  const t = useTranslations("common.soundscape");
  const [zoom, setZoom] = useState<TimeWindow>(FULL_DAY_WINDOW);
  const [visibleBands, setVisibleBands] = useState<boolean[]>(() => soundscape.bands.map(() => true));
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);

  const points = useMemo(() => soundscapePoints(soundscape.sources), [soundscape.sources]);
  const dateRange = useMemo(() => formatSoundscapeDateRange(soundscape.sources), [soundscape.sources]);

  const bandRanges = useMemo(
    () => FREQUENCY_BANDS.map((band) => formatBandRange(band, soundscape.ceilingHz)),
    [soundscape.ceilingHz],
  );
  const bandLabels = useMemo(
    () => FREQUENCY_BANDS.map((band, index) => `${t(`bands.${band.labelKey}`)} \u00b7 ${bandRanges[index]}`),
    [bandRanges, t],
  );

  /* One shared <audio> element, registered with the page-wide coordinator so
     starting a recording here stops whatever else was playing. */
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    return registerAudioElement(element);
  }, []);

  const stopPlayback = useCallback(() => {
    playTokenRef.current++;
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    setPlayer(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const playSource = useCallback(
    (source: SoundscapeSource) => {
      if (player?.audioUri === source.audioUri) {
        stopPlayback();
        return;
      }
      stopPlayback();
      setPlaybackFailed(false);
      const token = ++playTokenRef.current;
      setPlayer({
        audioUri: source.audioUri,
        minuteOfDay: source.minuteOfDay,
        name: source.name,
        status: "loading",
      });
      void (async () => {
        const playable = await resolvePlayableRecording(source.audioUri).catch(() => null);
        if (token !== playTokenRef.current) return;
        const element = audioRef.current;
        if (!playable || !element) {
          setPlayer(null);
          setPlaybackFailed(true);
          return;
        }
        // Try each candidate URL in turn: the compact preview blob first, the
        // archival original as a fallback for recordings uploaded before
        // previews were generated.
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
        setPlaybackFailed(true);
      })();
    },
    [player, stopPlayback],
  );

  const handlePointClick = useCallback(
    (minuteOfDay: number) => {
      const source = sourceForMinute(soundscape.sources, minuteOfDay);
      if (source) playSource(source);
    },
    [playSource, soundscape.sources],
  );

  /* Zoom aims at what is playing, else at the loudest moment in view, so
     zooming in from the whole day lands on recordings rather than on a blank
     stretch of the dial. */
  const zoomBy = useCallback(
    (factor: number) => {
      setZoom((current) => {
        let focus = player && isInWindow(player.minuteOfDay, current) ? player.minuteOfDay : null;
        if (focus === null) {
          let loudest = -Infinity;
          for (const point of points) {
            if (!isInWindow(point.minuteOfDay, current)) continue;
            const sum = point.pmn.reduce((total, value, band) => total + (visibleBands[band] ? value : 0), 0);
            if (sum > loudest) {
              loudest = sum;
              focus = point.minuteOfDay;
            }
          }
        }
        return zoomWindow(current, factor, focus ?? undefined);
      });
    },
    [player, points, visibleBands],
  );

  /** Every recording inside the zoom window, so two a minute apart stay
   *  individually reachable — the same affordance as the workbench. */
  const sourcesInView = useMemo(
    () =>
      soundscape.sources
        .filter((source) => isInWindow(source.minuteOfDay, zoom))
        .sort(
          (a, b) =>
            windowFraction(a.minuteOfDay, zoom) - windowFraction(b.minuteOfDay, zoom) ||
            a.date.localeCompare(b.date),
        ),
    [soundscape.sources, zoom],
  );

  const multiDay = useMemo(() => new Set(soundscape.sources.map((s) => s.date)).size > 1, [soundscape.sources]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <audio ref={audioRef} preload="none" className="hidden" onEnded={() => setPlayer(null)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {t("published.summary", { count: soundscape.sources.length, dates: dateRange })}
          </p>
          {player ? (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-primary">
              {player.status === "loading" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Volume2Icon className="size-3.5" />
              )}
              <span className="truncate">
                {player.status === "loading"
                  ? t("chart.loadingAudio", { name: player.name || formatMinuteOfDay(player.minuteOfDay) })
                  : t("chart.playing", { name: player.name || formatMinuteOfDay(player.minuteOfDay) })}
              </span>
              <button
                type="button"
                onClick={stopPlayback}
                className="flex items-center gap-1 rounded-md border border-primary/40 px-1.5 py-0.5 font-medium transition-colors hover:bg-primary/10"
              >
                <SquareIcon className="size-2.5 fill-current" />
                {t("chart.stop")}
              </button>
            </p>
          ) : playbackFailed ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangleIcon className="size-3.5" />
              {t("chart.playError")}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("published.playHint")}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs tabular-nums text-muted-foreground">
            {isFullDay(zoom)
              ? t("zoom.rangeAllDay")
              : t("zoom.range", {
                  start: formatWindowMinute(zoom.start),
                  end: formatWindowMinute(windowEnd(zoom)),
                })}
          </span>
          {!isFullDay(zoom) ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={t("zoom.zoomOut")}
              title={t("zoom.zoomOut")}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <MinusIcon className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t("zoom.zoomIn")}
            title={t("zoom.zoomIn")}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            <PlusIcon className="size-4" />
          </Button>
          {!isFullDay(zoom) ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setZoom(FULL_DAY_WINDOW)}>
              <RotateCcwIcon className="size-4" />
              {t("zoom.reset")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="mx-auto w-full max-w-xl">
          <SoundscapeClock
            points={points}
            visibleBands={visibleBands}
            bandLabels={bandLabels}
            title={soundscape.title || t("chart.title", { date: dateRange })}
            radialLabel={t("chart.radialLabel")}
            timeLabel={t("chart.timeLabel")}
            legendTitle={t("chart.legendTitle")}
            onPointClick={handlePointClick}
            onBackgroundClick={stopPlayback}
            playingMinute={player?.minuteOfDay ?? null}
            window={zoom}
            onWindowChange={setZoom}
            emptyLabel={t("zoom.empty")}
          />
        </div>
        <aside>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chart.legendTitle")}
          </p>
          <ul className="mt-2 space-y-1">
            {FREQUENCY_BANDS.map((band, index) => (
              <li key={band.id}>
                <button
                  type="button"
                  onClick={() =>
                    setVisibleBands((current) => current.map((visible, i) => (i === index ? !visible : visible)))
                  }
                  aria-pressed={visibleBands[index]}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    !visibleBands[index] && "opacity-40",
                  )}
                >
                  <span
                    aria-hidden
                    className="mt-2 inline-block h-0.5 w-5 shrink-0 rounded-full"
                    style={{ backgroundColor: BAND_COLORS[index] }}
                  />
                  <span className="min-w-0">
                    <span className="block text-foreground">{t(`bands.${band.labelKey}`)}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">{bandRanges[index]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {!isFullDay(zoom) ? (
        <div className="rounded-xl border bg-card/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">{t("zoom.recordingsTitle")}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("zoom.recordingsCount", { count: sourcesInView.length })}
            </p>
          </div>
          {sourcesInView.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("zoom.recordingsEmpty")}</p>
          ) : (
            <ul className="max-h-56 divide-y overflow-y-auto">
              {sourcesInView.map((source) => {
                const isPlaying = player?.audioUri === source.audioUri;
                return (
                  <li key={source.audioUri}>
                    <button
                      type="button"
                      onClick={() => playSource(source)}
                      aria-pressed={isPlaying}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                        isPlaying && "bg-primary/5",
                      )}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
                        {isPlaying ? (
                          player?.status === "loading" ? (
                            <Loader2Icon className="size-3.5 animate-spin text-primary" />
                          ) : (
                            <SquareIcon className="size-3 fill-current text-primary" />
                          )
                        ) : (
                          <Volume2Icon className="size-3.5" />
                        )}
                      </span>
                      <span className="w-14 shrink-0 font-medium tabular-nums text-foreground">
                        {formatMinuteOfDay(source.minuteOfDay)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {multiDay ? `${source.date} \u00b7 ` : ""}
                        {source.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
