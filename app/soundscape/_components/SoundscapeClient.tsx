"use client";

/**
 * Soundscape clock built from the user's already-uploaded recordings.
 *
 * The library is the account's `ac.audio` records: each one's archival
 * original (accessUri) is downloaded into the browser once, run through the
 * PMN pipeline, and the five per-band maxima are cached locally by record
 * CID — so returning to this tab redraws the clock without re-downloading.
 */

import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FileAudioIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  UploadIcon,
  Volume2Icon,
  WavesIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { listAllRecordings, type AcAudioListItem } from "@/app/_lib/ac-audio";
import {
  openWav,
  wallClockDateKey,
  wallClockFromIso,
  wallClockMinuteOfDay,
  type WallClockTime,
} from "@/lib/soundscape/audiomoth";
import {
  buildSoundscapePoints,
  formatBandRange,
  FREQUENCY_BANDS,
  nyquistHz,
} from "@/lib/soundscape/analysis";
import { computeRecordingPmn, RecordingTooShortError } from "@/lib/soundscape/pmn";
import { loadPmnCache, savePmnCache, toCacheEntry, type PmnCache } from "@/lib/soundscape/pmn-cache";
import { isRetryable, type AnalysisState, type AnalysisStatus } from "@/lib/soundscape/queue";
import { cn } from "@/lib/utils";
import { BAND_COLORS, SoundscapeClock } from "./SoundscapeClock";

/** One uploaded recording with everything the clock needs precomputed. */
type LibraryRecording = {
  item: AcAudioListItem;
  time: WallClockTime | null;
  /** Analyzable = has an archival original AND a usable recording time. */
  analyzable: boolean;
};

const ALL_DATES = "all";

type AnalyzedLibraryRecording = LibraryRecording & { time: WallClockTime; pmn: number[] };

type PlayerState = {
  uri: string;
  minuteOfDay: number;
  name: string;
  status: "loading" | "playing";
};

/**
 * Browsers cap AudioBuffer sample rates well below AudioMoth's ultrasonic
 * modes (up to 384 kHz), so recordings above this rate are decimated with a
 * boxcar average before playback. Ultrasound isn't audible anyway — this only
 * affects the preview player, never the analysis.
 */
const MAX_PLAYBACK_SAMPLE_RATE = 96_000;
const DECIMATION_TARGET_RATE = 48_000;

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatWallClock(time: WallClockTime): string {
  return `${wallClockDateKey(time)} ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

export function SoundscapeClient({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.soundscape");
  const [recordings, setRecordings] = useState<AcAudioListItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [results, setResults] = useState<Record<string, AnalysisState>>({});
  const [selectedDate, setSelectedDate] = useState<string>(ALL_DATES);
  const [visibleBands, setVisibleBands] = useState<boolean[]>(FREQUENCY_BANDS.map(() => true));
  const processingRef = useRef(false);
  const cacheRef = useRef<PmnCache | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playTokenRef = useRef(0);

  const library = useMemo<LibraryRecording[]>(() => {
    return (recordings ?? []).map((item) => {
      const time = wallClockFromIso(item.recordedAt);
      return { item, time, analyzable: Boolean(item.accessUri) && time !== null };
    });
  }, [recordings]);

  /* Load the account's uploaded recordings and seed results from the cache. */
  useEffect(() => {
    if (!sessionDid) return;
    let cancelled = false;
    const controller = new AbortController();
    setRecordings(null);
    setLoadFailed(false);
    (async () => {
      try {
        const items = await listAllRecordings(sessionDid, controller.signal);
        if (cancelled) return;
        const cache = cacheRef.current ?? loadPmnCache();
        cacheRef.current = cache;
        const seeded: Record<string, AnalysisState> = {};
        for (const item of items) {
          const cached = cache[item.cid];
          seeded[item.uri] = cached ? { status: "done", pmn: cached.bands } : { status: "idle" };
        }
        setResults(seeded);
        setRecordings(items);
      } catch {
        if (!cancelled) {
          setRecordings([]);
          setLoadFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionDid, reloadCounter]);

  /* Sequential analysis queue: download + analyze one recording at a time;
     each settled state update re-triggers this effect for the next one. */
  useEffect(() => {
    if (processingRef.current) return;
    const next = library.find((entry) => entry.analyzable && results[entry.item.uri]?.status === "queued");
    if (!next) return;
    processingRef.current = true;
    const { uri, cid, accessUri } = next.item;
    setResults((current) => ({ ...current, [uri]: { status: "downloading" } }));
    void (async () => {
      let update: AnalysisState;
      try {
        const response = await fetch(accessUri!);
        if (!response.ok) throw new Error("download_failed");
        const buffer = await response.arrayBuffer();
        setResults((current) => ({ ...current, [uri]: { status: "analyzing" } }));
        const wav = openWav(buffer);
        const { pmnPerBand, spectrum, sampleRate } = await computeRecordingPmn(wav);
        const cache = cacheRef.current ?? loadPmnCache();
        cacheRef.current = cache;
        cache[cid] = toCacheEntry(pmnPerBand, spectrum, sampleRate);
        savePmnCache(cache);
        update = { status: "done", pmn: pmnPerBand };
      } catch (error) {
        update = {
          status: "error",
          errorKind:
            error instanceof RecordingTooShortError
              ? "tooShort"
              : // TypeError = fetch network/CORS failure (e.g. the storage bucket
                // not allowing cross-origin GETs) — the bytes never arrived.
                error instanceof TypeError || (error instanceof Error && error.message === "download_failed")
                ? "download"
                : "decode",
        };
      }
      processingRef.current = false;
      setResults((current) => ({ ...current, [uri]: update }));
    })();
  }, [library, results]);

  const startAnalysis = useCallback(() => {
    setResults((current) => {
      const queued: Record<string, AnalysisState> = { ...current };
      for (const entry of library) {
        const state = queued[entry.item.uri];
        if (entry.analyzable && isRetryable(state)) {
          queued[entry.item.uri] = { status: "queued" };
        }
      }
      return queued;
    });
  }, [library]);

  const analyzableCount = library.filter((entry) => entry.analyzable).length;
  const remainingCount = library.filter(
    (entry) => entry.analyzable && isRetryable(results[entry.item.uri]),
  ).length;
  const doneCount = library.filter((entry) => results[entry.item.uri]?.status === "done").length;
  const active = library.find((entry) => {
    const status = results[entry.item.uri]?.status;
    return status === "downloading" || status === "analyzing";
  });
  const busy =
    active !== undefined ||
    library.some((entry) => results[entry.item.uri]?.status === "queued");
  const settledCount = library.filter((entry) => {
    const status = results[entry.item.uri]?.status;
    return status === "done" || status === "error";
  }).length;

  const dateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of library) {
      if (entry.time && results[entry.item.uri]?.status === "done") keys.add(wallClockDateKey(entry.time));
    }
    return [...keys].sort();
  }, [library, results]);

  useEffect(() => {
    if (selectedDate !== ALL_DATES && !dateKeys.includes(selectedDate)) setSelectedDate(ALL_DATES);
  }, [dateKeys, selectedDate]);

  const points = useMemo(() => {
    const usable = library.filter(
      (entry): entry is LibraryRecording & { time: WallClockTime } =>
        entry.time !== null && results[entry.item.uri]?.status === "done" && results[entry.item.uri]?.pmn !== undefined,
    );
    const filtered =
      selectedDate === ALL_DATES ? usable : usable.filter((entry) => wallClockDateKey(entry.time) === selectedDate);
    return buildSoundscapePoints(
      filtered.map((entry) => ({
        minuteOfDay: wallClockMinuteOfDay(entry.time),
        pmn: results[entry.item.uri]!.pmn!,
      })),
    );
  }, [library, results, selectedDate]);

  // Which recording to play for each dial minute. When several recordings
  // share a minute (same schedule slot across days), pick the loudest one —
  // that's the max the chart draws.
  const playableByMinute = useMemo(() => {
    const analyzed = library.filter(
      (entry): entry is AnalyzedLibraryRecording =>
        entry.time !== null &&
        results[entry.item.uri]?.status === "done" &&
        results[entry.item.uri]?.pmn !== undefined,
    ).map((entry) => ({ ...entry, pmn: results[entry.item.uri]!.pmn! }));
    const filtered =
      selectedDate === ALL_DATES
        ? analyzed
        : analyzed.filter((entry) => wallClockDateKey(entry.time) === selectedDate);
    const loudness = (entry: AnalyzedLibraryRecording) => entry.pmn.reduce((sum, value) => sum + value, 0);
    const byMinute = new Map<number, AnalyzedLibraryRecording>();
    for (const entry of filtered) {
      const minute = wallClockMinuteOfDay(entry.time);
      const existing = byMinute.get(minute);
      if (!existing || loudness(entry) > loudness(existing)) byMinute.set(minute, entry);
    }
    return byMinute;
  }, [library, results, selectedDate]);

  const stopPlayback = useCallback(() => {
    playTokenRef.current++;
    try {
      audioSourceRef.current?.stop();
    } catch {
      // Source may have already ended.
    }
    audioSourceRef.current = null;
    setPlayer(null);
  }, []);

  // Stop if the playing recording disappears (date filter / library refresh).
  useEffect(() => {
    if (player && playableByMinute.get(player.minuteOfDay)?.item.uri !== player.uri) stopPlayback();
  }, [playableByMinute, player, stopPlayback]);

  // Tear down audio on unmount.
  useEffect(() => {
    return () => {
      playTokenRef.current++;
      try {
        audioSourceRef.current?.stop();
      } catch {
        // Ignore.
      }
      void audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  const handlePointClick = useCallback(
    (minuteOfDay: number) => {
      const entry = playableByMinute.get(minuteOfDay);
      if (!entry?.item.accessUri) return;
      if (player?.minuteOfDay === minuteOfDay) {
        stopPlayback();
        return;
      }
      stopPlayback();
      setPlaybackFailed(false);
      const token = ++playTokenRef.current;
      const accessUri = entry.item.accessUri;
      setPlayer({ uri: entry.item.uri, minuteOfDay, name: entry.item.name, status: "loading" });
      void (async () => {
        try {
          const response = await fetch(accessUri);
          if (!response.ok) throw new Error("download_failed");
          const buffer = await response.arrayBuffer();
          const wav = openWav(buffer);
          let samples = new Float32Array(wav.totalSamples);
          wav.readWindow(0, samples);
          let sampleRate = wav.sampleRate;
          if (sampleRate > MAX_PLAYBACK_SAMPLE_RATE) {
            const factor = Math.ceil(sampleRate / DECIMATION_TARGET_RATE);
            const length = Math.floor(samples.length / factor);
            const decimated = new Float32Array(length);
            for (let i = 0; i < length; i++) {
              let sum = 0;
              for (let j = 0; j < factor; j++) sum += samples[i * factor + j];
              decimated[i] = sum / factor;
            }
            samples = decimated;
            sampleRate = sampleRate / factor;
          }
          if (token !== playTokenRef.current) return;
          const context = (audioContextRef.current ??= new AudioContext());
          await context.resume();
          if (token !== playTokenRef.current) return;
          const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
          audioBuffer.getChannelData(0).set(samples);
          const source = context.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(context.destination);
          source.onended = () => {
            if (token === playTokenRef.current) {
              audioSourceRef.current = null;
              setPlayer(null);
            }
          };
          audioSourceRef.current = source;
          source.start();
          setPlayer((current) => (current?.uri === entry.item.uri ? { ...current, status: "playing" } : current));
        } catch {
          if (token === playTokenRef.current) {
            setPlayer(null);
            setPlaybackFailed(true);
          }
        }
      })();
    },
    [playableByMinute, player, stopPlayback],
  );

  const chartDateLabel =
    selectedDate !== ALL_DATES
      ? selectedDate
      : dateKeys.length === 0
        ? ""
        : dateKeys.length === 1
          ? dateKeys[0]
          : `${dateKeys[0]} \u2013 ${dateKeys[dateKeys.length - 1]}`;

  /**
   * Top of the displayed spectrum: the highest frequency any of these
   * recordings can actually represent, so the open-ended top band never
   * advertises range the hardware never captured.
   */
  const ceilingHz = useMemo(() => {
    const rates = library.map((entry) => entry.item.sampleRate).filter((rate): rate is number => !!rate);
    return rates.length > 0 ? nyquistHz(Math.max(...rates)) : nyquistHz(48000);
  }, [library]);

  const bandRanges = useMemo(
    () => FREQUENCY_BANDS.map((band) => formatBandRange(band, ceilingHz)),
    [ceilingHz],
  );
  const bandLabels = useMemo(
    () => FREQUENCY_BANDS.map((band, index) => `${t(`bands.${band.labelKey}`)} \u00b7 ${bandRanges[index]}`),
    [bandRanges, t],
  );

  const downloadPng = useCallback(async () => {
    const svg = chartRef.current?.querySelector<SVGSVGElement>("svg[data-soundscape-clock]");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", "1440");
    clone.setAttribute("height", "1440");
    // Inline theme colors so the exported image doesn't depend on CSS variables.
    clone.style.color = "#64748b";
    clone.querySelectorAll(".fill-muted-foreground").forEach((node) => node.setAttribute("fill", "#64748b"));
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("SVG rasterization failed"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = 1440;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = `soundscape-${chartDateLabel || "clock"}.png`;
      anchor.click();
    } catch {
      // Best effort — the on-screen chart is unaffected.
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [chartDateLabel]);

  if (!sessionDid) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <WavesIcon className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("library.signInTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("library.signInBody")}</p>
      </div>
    );
  }

  if (recordings === null) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/70 px-6 py-16 text-sm text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin text-primary" />
        {t("library.loading")}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <FileAudioIcon className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("library.emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {loadFailed ? t("library.loadFailed") : t("library.emptyBody")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/audiomoth?tab=upload">
              <UploadIcon className="size-4" />
              {t("library.goToUpload")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setReloadCounter((value) => value + 1)}>
            <RefreshCwIcon className="size-4" />
            {t("library.refresh")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Library of uploaded recordings */}
      <section className="rounded-2xl border bg-background shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <WavesIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("library.count", { count: recordings.length })}</p>
              <p className="truncate text-xs text-muted-foreground">{t("library.downloadNote")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {busy ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                {active
                  ? results[active.item.uri]?.status === "downloading"
                    ? t("library.downloading", { name: active.item.name })
                    : t("library.analyzing", { name: active.item.name })
                  : t("library.progress", { done: doneCount, total: analyzableCount })}
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setReloadCounter((value) => value + 1)}
            >
              <RefreshCwIcon className="size-4" />
              {t("library.refresh")}
            </Button>
            <Button type="button" size="sm" disabled={busy || remainingCount === 0} onClick={startAnalysis}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
              {busy
                ? t("library.analyzeBusy", { done: doneCount, total: analyzableCount })
                : remainingCount > 0
                  ? t("library.analyze", { count: remainingCount })
                  : t("library.analyzeDone")}
            </Button>
          </div>
        </div>
        {busy ? (
          <div
            className="h-1 w-full overflow-hidden bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={analyzableCount}
            aria-valuenow={settledCount}
            aria-label={t("library.progress", { done: settledCount, total: analyzableCount })}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${(settledCount / Math.max(1, analyzableCount)) * 100}%` }}
            />
          </div>
        ) : null}
        <ul className="max-h-72 divide-y overflow-y-auto">
          {library.map((entry) => {
            const state = results[entry.item.uri] ?? { status: "idle" as const };
            return (
              <li key={entry.item.uri} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <StatusIcon status={state.status} analyzable={entry.analyzable} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{entry.item.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {entry.time ? (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {formatWallClock(entry.time)}
                      </span>
                    ) : null}
                    {formatDuration(entry.item.durationSeconds) ? (
                      <span>{formatDuration(entry.item.durationSeconds)}</span>
                    ) : null}
                    <StatusLabel entry={entry} state={state} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Chart */}
      <section className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-medium text-foreground">
              {chartDateLabel ? t("chart.title", { date: chartDateLabel }) : t("chart.title", { date: t("chart.allDates") })}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("chart.hoverHint")}</p>
            {player ? (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-primary">
                {player.status === "loading" ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <Volume2Icon className="size-3.5" />
                )}
                <span className="truncate">
                  {player.status === "loading"
                    ? t("chart.loadingAudio", { name: player.name })
                    : t("chart.playing", { name: player.name })}
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
            ) : null}
          </div>
          {points.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadPng()}>
              <DownloadIcon />
              {t("chart.downloadPng")}
            </Button>
          ) : null}
        </div>

        {dateKeys.length > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("chart.datesTitle")}>
            <DateChip active={selectedDate === ALL_DATES} onClick={() => setSelectedDate(ALL_DATES)}>
              {t("chart.allDatesChip")}
            </DateChip>
            {dateKeys.map((key) => (
              <DateChip key={key} active={selectedDate === key} onClick={() => setSelectedDate(key)}>
                {key}
              </DateChip>
            ))}
          </div>
        ) : null}

        {points.length > 0 ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div ref={chartRef} className="mx-auto w-full max-w-2xl">
              <SoundscapeClock
                points={points}
                visibleBands={visibleBands}
                bandLabels={bandLabels}
                title={t("chart.title", { date: chartDateLabel || t("chart.allDates") })}
                radialLabel={t("chart.radialLabel")}
                timeLabel={t("chart.timeLabel")}
                legendTitle={t("chart.legendTitle")}
                onPointClick={handlePointClick}
                playingMinute={player?.minuteOfDay ?? null}
                playHintLabel={t("chart.clickToPlay")}
                stopHintLabel={t("chart.clickToStop")}
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
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {bandRanges[index]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 px-2 text-xs leading-5 text-muted-foreground">{t("chart.bandsNote")}</p>
            </aside>
          </div>
        ) : (
          <div className="mt-4 flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl bg-muted/30 p-8 text-center">
            <FileAudioIcon className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">{t("chart.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("chart.emptyHint")}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusIcon({ status, analyzable }: { status: AnalysisStatus; analyzable: boolean }) {
  if (!analyzable) return <AlertTriangleIcon className="size-4 shrink-0 text-muted-foreground/60" />;
  switch (status) {
    case "downloading":
    case "analyzing":
      return <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />;
    case "done":
      return <CheckIcon className="size-4 shrink-0 text-primary" />;
    case "error":
      return <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />;
    default:
      return <FileAudioIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function StatusLabel({ entry, state }: { entry: LibraryRecording; state: AnalysisState }) {
  const t = useTranslations("common.soundscape.library");
  if (!entry.analyzable) {
    return (
      <span>{entry.time === null ? t("statusNoTime") : t("statusNoOriginal")}</span>
    );
  }
  switch (state.status) {
    case "queued":
      return <span>{t("statusQueued")}</span>;
    case "done":
      return <span className="text-primary">{t("statusAnalyzed")}</span>;
    case "error":
      return (
        <span className="text-destructive">
          {state.errorKind === "tooShort" ? t("tooShort") : t("statusError")}
        </span>
      );
    case "downloading":
    case "analyzing":
      return null;
    default:
      return <span>{t("statusNotAnalyzed")}</span>;
  }
}

function DateChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        props.active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {props.children}
    </button>
  );
}
