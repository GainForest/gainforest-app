"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FileAudioIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  openWav,
  parseAudioMothTimestamp,
  wallClockDateKey,
  wallClockFromEpochMillis,
  wallClockMinuteOfDay,
  type WallClockTime,
} from "@/lib/soundscape/audiomoth";
import {
  analyzeRecording,
  buildSoundscapePoints,
  formatBandLabel,
  FREQUENCY_BANDS,
  RecordingTooShortError,
} from "@/lib/soundscape/analysis";
import { cn } from "@/lib/utils";
import { BAND_COLORS, SoundscapeClock } from "./SoundscapeClock";

type FileStatus = "pending" | "analyzing" | "done" | "error";

type ImportedRecording = {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  status: FileStatus;
  errorKind?: "decode" | "tooShort";
  timestamp: WallClockTime | null;
  timeSource: "filename" | "modified";
  pmnDb?: number[];
};

const ALL_DATES = "all";

function isWavFile(file: File): boolean {
  return /\.wav$/i.test(file.name) || file.type === "audio/wav" || file.type === "audio/x-wav";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function recordingTimestamp(file: File): { timestamp: WallClockTime | null; timeSource: "filename" | "modified" } {
  const fromName = parseAudioMothTimestamp(file.name);
  if (fromName) return { timestamp: fromName, timeSource: "filename" };
  return { timestamp: wallClockFromEpochMillis(file.lastModified, "local"), timeSource: "modified" };
}

export function SoundscapeClient() {
  const t = useTranslations("common.soundscape");
  const [recordings, setRecordings] = useState<ImportedRecording[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(ALL_DATES);
  const [visibleBands, setVisibleBands] = useState<boolean[]>(FREQUENCY_BANDS.map(() => true));
  const [isDragOver, setIsDragOver] = useState(false);
  const [rejectedNonWav, setRejectedNonWav] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const files = [...incoming];
    const wavFiles = files.filter(isWavFile);
    setRejectedNonWav(wavFiles.length < files.length);
    if (wavFiles.length === 0) return;
    setRecordings((current) => {
      const known = new Set(current.map((entry) => `${entry.name}|${entry.sizeBytes}`));
      const additions: ImportedRecording[] = [];
      for (const file of wavFiles) {
        const key = `${file.name}|${file.size}`;
        if (known.has(key)) continue;
        known.add(key);
        additions.push({
          id: `${key}|${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          sizeBytes: file.size,
          status: "pending",
          ...recordingTimestamp(file),
        });
      }
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, []);

  // Sequential analysis queue: pick the next pending file, analyze it, and let
  // the resulting state update re-trigger this effect for the one after.
  useEffect(() => {
    if (processingRef.current) return;
    const next = recordings.find((entry) => entry.status === "pending");
    if (!next) return;
    processingRef.current = true;
    setRecordings((current) =>
      current.map((entry) => (entry.id === next.id ? { ...entry, status: "analyzing" as const } : entry)),
    );
    void (async () => {
      let update: Partial<ImportedRecording>;
      try {
        const buffer = await next.file.arrayBuffer();
        const wav = openWav(buffer);
        const { maxPmnDb } = await analyzeRecording(wav);
        update = { status: "done", pmnDb: maxPmnDb };
      } catch (error) {
        update = {
          status: "error",
          errorKind: error instanceof RecordingTooShortError ? "tooShort" : "decode",
        };
      }
      processingRef.current = false;
      setRecordings((current) => current.map((entry) => (entry.id === next.id ? { ...entry, ...update } : entry)));
    })();
  }, [recordings]);

  const removeRecording = (id: string) => {
    setRecordings((current) => current.filter((entry) => entry.id !== id));
  };

  const clearAll = () => {
    setRecordings((current) => current.filter((entry) => entry.status === "analyzing"));
    setSelectedDate(ALL_DATES);
  };

  const doneCount = recordings.filter((entry) => entry.status === "done").length;
  const errorCount = recordings.filter((entry) => entry.status === "error").length;
  const analyzing = recordings.find((entry) => entry.status === "analyzing");
  const settledCount = doneCount + errorCount;
  const busy = recordings.some((entry) => entry.status === "pending" || entry.status === "analyzing");

  const dateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of recordings) {
      if (entry.status === "done" && entry.timestamp) keys.add(wallClockDateKey(entry.timestamp));
    }
    return [...keys].sort();
  }, [recordings]);

  useEffect(() => {
    if (selectedDate !== ALL_DATES && !dateKeys.includes(selectedDate)) setSelectedDate(ALL_DATES);
  }, [dateKeys, selectedDate]);

  const points = useMemo(() => {
    const usable = recordings.filter(
      (entry): entry is ImportedRecording & { pmnDb: number[]; timestamp: WallClockTime } =>
        entry.status === "done" && entry.pmnDb !== undefined && entry.timestamp !== null,
    );
    const filtered =
      selectedDate === ALL_DATES ? usable : usable.filter((entry) => wallClockDateKey(entry.timestamp) === selectedDate);
    return buildSoundscapePoints(
      filtered.map((entry) => ({ minuteOfDay: wallClockMinuteOfDay(entry.timestamp), pmnDb: entry.pmnDb })),
    );
  }, [recordings, selectedDate]);

  const chartDateLabel =
    selectedDate !== ALL_DATES
      ? selectedDate
      : dateKeys.length === 0
        ? ""
        : dateKeys.length === 1
          ? dateKeys[0]
          : `${dateKeys[0]} \u2013 ${dateKeys[dateKeys.length - 1]}`;

  const bandLabels = useMemo(() => FREQUENCY_BANDS.map(formatBandLabel), []);

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

  return (
    <div className="flex flex-col gap-8">
      {/* Import area */}
      <section
        className={cn(
          "rounded-2xl border border-dashed bg-muted/30 p-6 transition-colors",
          isDragOver && "border-primary bg-primary/5",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UploadIcon className="size-5" />
          </span>
          <div>
            <p className="font-medium text-foreground">{t("import.dropTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("import.dropHint")}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileAudioIcon />
            {t("import.browse")}
          </Button>
          {rejectedNonWav ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangleIcon className="size-4" />
              {t("import.onlyWav")}
            </p>
          ) : null}
        </div>
      </section>

      {/* File list + progress */}
      {recordings.length > 0 ? (
        <section className="rounded-2xl border bg-background shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {t("import.fileCount", { count: recordings.length })}
            </p>
            <div className="flex items-center gap-3">
              {busy ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  {analyzing
                    ? t("import.analyzing", { name: analyzing.name })
                    : t("import.progress", { done: settledCount, total: recordings.length })}
                </span>
              ) : null}
              <Button type="button" variant="ghost" size="xs" onClick={clearAll}>
                <Trash2Icon />
                {t("import.clearAll")}
              </Button>
            </div>
          </div>
          {busy ? (
            <div className="h-1 w-full overflow-hidden bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={recordings.length} aria-valuenow={settledCount} aria-label={t("import.progress", { done: settledCount, total: recordings.length })}>
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${(settledCount / Math.max(1, recordings.length)) * 100}%` }}
              />
            </div>
          ) : null}
          <ul className="max-h-72 divide-y overflow-y-auto">
            {recordings.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <StatusIcon status={entry.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{entry.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(entry.sizeBytes)}</span>
                    {entry.timestamp ? (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {wallClockDateKey(entry.timestamp)}{" "}
                        {`${String(entry.timestamp.hour).padStart(2, "0")}:${String(entry.timestamp.minute).padStart(2, "0")}`}
                        {entry.timeSource === "modified" ? (
                          <span className="text-amber-600 dark:text-amber-400" title={t("import.timeFromModified")}>
                            *
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {entry.status === "error" ? (
                      <span className="text-destructive">
                        {entry.errorKind === "tooShort" ? t("import.tooShort") : t("import.statusError")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeRecording(entry.id)}
                  aria-label={t("import.removeFile", { name: entry.name })}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {recordings.some((entry) => entry.timeSource === "modified") ? (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">* {t("import.timeFromModified")}</p>
          ) : null}
        </section>
      ) : null}

      {/* Chart */}
      <section className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-medium text-foreground">
              {chartDateLabel ? t("chart.title", { date: chartDateLabel }) : t("chart.title", { date: t("chart.allDates") })}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("chart.hoverHint")}</p>
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
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                        !visibleBands[index] && "opacity-40",
                      )}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-0.5 w-5 rounded-full"
                        style={{ backgroundColor: BAND_COLORS[index] }}
                      />
                      <span className="tabular-nums text-foreground">{bandLabels[index]}</span>
                    </button>
                  </li>
                ))}
              </ul>
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

function StatusIcon(props: { status: FileStatus }) {
  switch (props.status) {
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
