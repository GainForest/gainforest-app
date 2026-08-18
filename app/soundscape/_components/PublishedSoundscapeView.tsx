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

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import { BAND_COLORS, SoundscapeClock } from "./SoundscapeClock";
import { useSoundscapePlayback } from "./useSoundscapePlayback";
import { fetchRecordingByUri, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { resolvePdsHost } from "@/app/_lib/pds";
import { RecordingsPlayerList } from "@/app/_components/RecordingsPlayerList";

/** One notch of the zoom buttons — matches the workbench dial. */
const ZOOM_STEP = 1.6;

export function PublishedSoundscapeView({
  soundscape,
  did,
  className,
}: {
  soundscape: PublishedSoundscape;
  /** The owner's DID — every source recording lives in this repo, and it's how
   *  each in-view recording's full record (spectrogram, preview, original) is
   *  fetched to render the list below. */
  did: string;
  className?: string;
}) {
  const t = useTranslations("common.soundscape");
  const [zoom, setZoom] = useState<TimeWindow>(FULL_DAY_WINDOW);
  const [visibleBands, setVisibleBands] = useState<boolean[]>(() => soundscape.bands.map(() => true));
  /* Playback is the one shared soundscape player: preview-blob-first, one
     recording at a time across the page. Aliased to the names this view has
     always used so the rest of the component reads unchanged. */
  const {
    audioProps,
    player,
    failed: playbackFailed,
    stop: stopPlayback,
    toggle: playSource,
  } = useSoundscapePlayback();

  /* The owner's PDS host + each in-view recording's full record, resolved on
     demand so the list below can show spectrograms, play, and download — the
     soundscape record stores only a pointer per source. */
  const [host, setHost] = useState<string | null>(null);
  const [recordItems, setRecordItems] = useState<Map<string, AcAudioListItem>>(() => new Map());

  /* Resolve the owner's PDS host once (a cached DID-doc lookup, shared with the
     per-recording reads below). */
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void resolvePdsHost(did, controller.signal)
      .then((resolved) => {
        if (!cancelled) setHost(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [did]);

  const points = useMemo(() => soundscapePoints(soundscape.sources), [soundscape.sources]);
  const dateRange = useMemo(() => formatSoundscapeDateRange(soundscape.sources), [soundscape.sources]);

  /* A shared clock has to stand on its own: whoever opens the link never saw
     the recordings behind it, so it says what the line and the shading are. */
  const chartSubtitle = useMemo(() => {
    let min = Infinity;
    let max = 0;
    for (const point of points) {
      if (point.count < min) min = point.count;
      if (point.count > max) max = point.count;
    }
    if (max < 2) return undefined;
    return [
      min === max ? t("chart.averageNote", { count: max }) : t("chart.averageNoteRange", { min, max }),
      t("chart.spreadNote"),
    ];
  }, [points, t]);

  const bandRanges = useMemo(
    () => FREQUENCY_BANDS.map((band) => formatBandRange(band, soundscape.ceilingHz)),
    [soundscape.ceilingHz],
  );
  const bandLabels = useMemo(
    () => FREQUENCY_BANDS.map((band, index) => `${t(`bands.${band.labelKey}`)} \u00b7 ${bandRanges[index]}`),
    [bandRanges, t],
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

  /* Hydrate the in-view recordings from their own records — just the handful
     inside the current zoom window, each fetched once and kept. */
  useEffect(() => {
    const missing = sourcesInView
      .map((source) => source.audioUri)
      .filter((uri) => !recordItems.has(uri));
    if (missing.length === 0) return;
    const controller = new AbortController();
    void (async () => {
      const resolved = await Promise.all(
        missing.map((uri) => fetchRecordingByUri(uri, controller.signal).catch(() => null)),
      );
      if (controller.signal.aborted) return;
      setRecordItems((current) => {
        let changed = false;
        const next = new Map(current);
        resolved.forEach((item, index) => {
          if (item && !next.has(missing[index])) {
            next.set(missing[index], item);
            changed = true;
          }
        });
        return changed ? next : current;
      });
    })();
    return () => controller.abort();
  }, [sourcesInView, recordItems]);

  /** In-view recordings whose records have resolved, kept in dial order. */
  const inViewItems = useMemo(
    () =>
      sourcesInView
        .map((source) => recordItems.get(source.audioUri))
        .filter((item): item is AcAudioListItem => Boolean(item)),
    [sourcesInView, recordItems],
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <audio {...audioProps} />

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
            subtitle={chartSubtitle}
            pointDetail={(point) =>
              point.count > 1 ? t("chart.pointRecordings", { count: point.count }) : null
            }
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
          <p className="mt-1 text-xs leading-5 text-muted-foreground/80">{t("chart.legendHint")}</p>
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
          {visibleBands.some((visible) => !visible) ? (
            <button
              type="button"
              onClick={() => setVisibleBands((current) => current.map(() => true))}
              className="mt-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted"
            >
              {t("chart.showAllBands")}
            </button>
          ) : null}
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
          ) : inViewItems.length === 0 ? (
            <div className="flex flex-col gap-1.5 p-3" aria-hidden>
              {sourcesInView.slice(0, 4).map((source) => (
                <div key={source.audioUri} className="h-[4.5rem] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="p-3">
              <RecordingsPlayerList did={did} host={host} items={inViewItems} onPlay={stopPlayback} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
