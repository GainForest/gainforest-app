"use client";

/**
 * Identifications: every saved AudioMoth label (a `dwc.occurrence` box) across
 * all of the signed-in account's recordings, gathered onto one page. Read-only
 * roll-up of the per-recording labelling workspace, with search, category
 * filtering and a single CSV export.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BirdIcon,
  BugIcon,
  DownloadIcon,
  Loader2Icon,
  NotebookPenIcon,
  PawPrintIcon,
  RefreshCwIcon,
  SearchIcon,
  TagsIcon,
  WavesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AUDIO_LABEL_CATEGORIES,
  audioLabelsToCsv,
  type AudioLabel,
  type AudioLabelCategory,
} from "@/app/_lib/audiomoth/labels";
import {
  audioOccurrenceDisplayName,
  listAllAudioOccurrences,
  type AudioOccurrenceItem,
} from "@/app/_lib/audiomoth/occurrences";
import { listAllRecordings } from "@/app/_lib/ac-audio";

const CATEGORY_META: Record<AudioLabelCategory, { chip: string; Icon: typeof BirdIcon }> = {
  bird: { chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", Icon: BirdIcon },
  frog: { chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300", Icon: WavesIcon },
  insect: { chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300", Icon: BugIcon },
  other: { chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300", Icon: PawPrintIcon },
  note: { chip: "bg-slate-500/12 text-slate-700 dark:text-slate-300", Icon: NotebookPenIcon },
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function formatFrequency(hz: number): string {
  return hz >= 1_000 ? `${(hz / 1_000).toFixed(hz >= 10_000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function downloadText(content: string, filename: string): void {
  const href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function IdentificationsClient({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.identifications");
  const [occurrences, setOccurrences] = useState<AudioOccurrenceItem[] | null>(null);
  const [recordingNames, setRecordingNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<AudioLabelCategory | "all">("all");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!sessionDid) return;
    setError(null);
    setOccurrences(null);
    try {
      const [items, recordings] = await Promise.all([
        listAllAudioOccurrences(sessionDid, signal),
        listAllRecordings(sessionDid, signal).catch(() => []),
      ]);
      if (signal?.aborted) return;
      setRecordingNames(Object.fromEntries(recordings.map((recording) => [recording.uri, recording.name])));
      setOccurrences(items);
    } catch {
      if (signal?.aborted) return;
      setOccurrences([]);
      setError(t("loadFailed"));
    }
  }, [sessionDid, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const recordingLabel = useCallback(
    (item: AudioOccurrenceItem) => recordingNames[item.sourceAudioUri] ?? t("unknownRecording"),
    [recordingNames, t],
  );

  const counts = useMemo(() => {
    const base: Record<AudioLabelCategory, number> = { bird: 0, frog: 0, insect: 0, other: 0, note: 0 };
    for (const item of occurrences ?? []) base[item.category] += 1;
    return base;
  }, [occurrences]);

  const shown = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (occurrences ?? []).filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (!normalized) return true;
      const haystack = [
        audioOccurrenceDisplayName(item),
        item.commonName,
        item.scientificName,
        item.note,
        recordingLabel(item),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [activeCategory, occurrences, query, recordingLabel]);

  const exportAll = useCallback(() => {
    if (!occurrences || occurrences.length === 0) return;
    const labels: AudioLabel[] = occurrences.map((item) => ({
      id: item.uri,
      fileKey: item.sourceAudioUri,
      fileName: recordingLabel(item),
      category: item.category,
      species: audioOccurrenceDisplayName(item) || item.scientificName,
      note: item.note,
      startTimeSeconds: item.bounds.startTimeSeconds,
      endTimeSeconds: item.bounds.endTimeSeconds,
      minFrequencyHz: item.bounds.minFrequencyHz,
      maxFrequencyHz: item.bounds.maxFrequencyHz,
      box: { startX: 0, endX: 0, topY: 0, bottomY: 0 },
      createdAt: item.createdAt,
    }));
    downloadText(audioLabelsToCsv(labels), `identifications-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [occurrences, recordingLabel]);

  if (!sessionDid) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <TagsIcon className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("signInTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("signInBody")}</p>
      </div>
    );
  }

  if (occurrences === null) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/70 px-6 py-16 text-sm text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin text-primary" />
        {t("loading")}
      </div>
    );
  }

  const total = occurrences.length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><TagsIcon className="size-4.5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("summary", { count: total })}</p>
            <p className="truncate text-xs text-muted-foreground">{t("summaryHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/audiomoth?tab=label"><TagsIcon className="size-4" />{t("openLabeller")}</Link></Button>
          <Button variant="outline" size="sm" disabled={total === 0} onClick={exportAll}><DownloadIcon className="size-4" />{t("export")}</Button>
          <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCwIcon className="size-4" />{t("refresh")}</Button>
        </div>
      </div>

      {total > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="h-8 pl-8 text-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={activeCategory === "all"} onClick={() => setActiveCategory("all")} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors", activeCategory === "all" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{t("filterAll", { count: total })}</button>
            {AUDIO_LABEL_CATEGORIES.map((category) => {
              const count = counts[category];
              if (count === 0) return null;
              const { Icon } = CATEGORY_META[category];
              return (
                <button key={category} type="button" aria-pressed={activeCategory === category} onClick={() => setActiveCategory(category)} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors", activeCategory === category ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                  <Icon className="size-3" />{t(`categories.${category}`)} · {count}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

      {total === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
          <WavesIcon className="mx-auto size-8 text-primary" />
          <h2 className="mt-4 text-lg font-medium text-foreground">{t("emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("emptyBody")}</p>
          <div className="mt-5 flex justify-center">
            <Button asChild><Link href="/audiomoth?tab=label"><TagsIcon className="size-4" />{t("openLabeller")}</Link></Button>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card/80">
          <ul className="divide-y divide-border">
            {shown.map((item) => {
              const { chip, Icon } = CATEGORY_META[item.category];
              const name = audioOccurrenceDisplayName(item) || t(`categories.${item.category}`);
              return (
                <li key={item.uri} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", chip)}>
                      <Icon className="size-3" />{t(`categories.${item.category}`)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      {item.note ? <p className="truncate text-xs text-muted-foreground">{item.note}</p> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:justify-end">
                    <span className="inline-flex items-center gap-1"><WavesIcon className="size-3 opacity-60" /><span className="max-w-[12rem] truncate font-mono">{recordingLabel(item)}</span></span>
                    <span className="font-mono">{formatTime(item.bounds.startTimeSeconds)}–{formatTime(item.bounds.endTimeSeconds)}</span>
                    <span className="font-mono">{formatFrequency(item.bounds.minFrequencyHz)}–{formatFrequency(item.bounds.maxFrequencyHz)}</span>
                    <span className="tabular-nums">{formatDate(item.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
