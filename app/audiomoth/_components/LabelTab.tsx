"use client";

/**
 * Interactive AudioMoth spectrogram labelling workspace.
 *
 * Every confirmed box is persisted as its own
 * `app.gainforest.dwc.occurrence` record. See
 * docs/audiomoth-spectrogram-occurrences.md for the mapping.
 */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import {
  BirdIcon,
  BugIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Loader2Icon,
  NotebookPenIcon,
  PawPrintIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  WavesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AUDIO_LABEL_CATEGORIES,
  audioLabelsToCsv,
  normalizeSpectrogramBox,
  spectrogramBoxToBounds,
  type AudioLabel,
  type AudioLabelCategory,
  type NormalizedSpectrogramBox,
} from "@/app/_lib/audiomoth/labels";
import {
  createAudioOccurrence,
  deleteAudioOccurrence,
  listAudioOccurrences,
  updateAudioOccurrence,
  type AudioOccurrenceDraft,
  type AudioOccurrenceItem,
} from "@/app/_lib/audiomoth/occurrences";
import { colorForSpectrogram, computeSpectrogram } from "@/app/_lib/audiomoth/spectrogram";
import { listAllRecordings, pdsBlobUrl, type AcAudioListItem } from "@/app/_lib/ac-audio";
import { listAcDeployments, type AcDeploymentItem } from "@/app/_lib/ac-deployment";
import { resolvePdsHost } from "@/app/_lib/pds";

const MAX_SPECTROGRAM_COLUMNS = 1_100;
const FFT_SIZE = 1_024;
const MIN_BOX_SIZE = 0.006;

type SpectrogramReady = {
  durationSeconds: number;
  maxFrequencyHz: number;
};

type DrawState = {
  anchorX: number;
  anchorY: number;
};

const CATEGORY_STYLES: Record<AudioLabelCategory, { box: string; chip: string }> = {
  bird: { box: "border-emerald-300 bg-emerald-300/20", chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  frog: { box: "border-cyan-300 bg-cyan-300/20", chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300" },
  insect: { box: "border-amber-300 bg-amber-300/20", chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  other: { box: "border-violet-300 bg-violet-300/20", chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  note: { box: "border-slate-200 bg-slate-200/20", chip: "bg-slate-500/12 text-slate-700 dark:text-slate-300" },
};

const CATEGORY_ICONS = {
  bird: BirdIcon,
  frog: WavesIcon,
  insect: BugIcon,
  other: PawPrintIcon,
  note: NotebookPenIcon,
} satisfies Record<AudioLabelCategory, typeof BirdIcon>;

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function formatFrequency(hz: number): string {
  return hz >= 1_000 ? `${(hz / 1_000).toFixed(hz >= 10_000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}

function boundsToBox(
  item: AudioOccurrenceItem,
  durationSeconds: number,
  maxFrequencyHz: number,
): NormalizedSpectrogramBox {
  const duration = Math.max(0.001, durationSeconds);
  const maximum = Math.max(1, maxFrequencyHz);
  return normalizeSpectrogramBox(
    item.bounds.startTimeSeconds / duration,
    1 - item.bounds.maxFrequencyHz / maximum,
    item.bounds.endTimeSeconds / duration,
    1 - item.bounds.minFrequencyHz / maximum,
  );
}

function downloadText(content: string, filename: string): void {
  const href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function recordingAudioUrls(recording: AcAudioListItem, host: string | null): string[] {
  return [...new Set([
    recording.accessUri,
    host && recording.previewCid ? pdsBlobUrl(host, recording.did, recording.previewCid) : null,
  ].filter((value): value is string => Boolean(value)))];
}

export function LabelTab({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.audiomoth.label");
  const [recordings, setRecordings] = useState<AcAudioListItem[] | null>(null);
  const [deployments, setDeployments] = useState<AcDeploymentItem[]>([]);
  const [host, setHost] = useState<string | null>(null);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<AudioOccurrenceItem[]>([]);
  const [occurrenceCounts, setOccurrenceCounts] = useState<Record<string, number>>({});
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);
  const [ready, setReady] = useState<SpectrogramReady | null>(null);
  const [draftBox, setDraftBox] = useState<NormalizedSpectrogramBox | null>(null);
  const [category, setCategory] = useState<AudioLabelCategory>("bird");
  const [commonName, setCommonName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [note, setNote] = useState("");
  const [editingUri, setEditingUri] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!sessionDid) return;
    setWorkspaceError(null);
    setRecordings(null);
    const controller = new AbortController();
    try {
      const [nextRecordings, nextDeployments, nextHost] = await Promise.all([
        listAllRecordings(sessionDid, controller.signal),
        listAcDeployments(sessionDid, controller.signal),
        resolvePdsHost(sessionDid, controller.signal),
      ]);
      setRecordings(nextRecordings);
      setDeployments(nextDeployments);
      setHost(nextHost);
      setSelectedUri((current) =>
        current && nextRecordings.some((recording) => recording.uri === current)
          ? current
          : nextRecordings.at(-1)?.uri ?? null,
      );
    } catch {
      setRecordings([]);
      setWorkspaceError(t("loadFailed"));
    }
    return () => controller.abort();
  }, [sessionDid, t]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const selectedRecording = useMemo(
    () => recordings?.find((recording) => recording.uri === selectedUri) ?? null,
    [recordings, selectedUri],
  );
  const selectedIndex = selectedRecording && recordings ? recordings.findIndex((recording) => recording.uri === selectedRecording.uri) : -1;
  const shownRecordings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = recordings ?? [];
    return normalized ? source.filter((recording) => recording.name.toLowerCase().includes(normalized)) : source;
  }, [query, recordings]);
  const audioUrls = useMemo(
    () => selectedRecording ? recordingAudioUrls(selectedRecording, host) : [],
    [host, selectedRecording],
  );

  const startFreshLabel = useCallback((box: NormalizedSpectrogramBox | null) => {
    setDraftBox(box);
    setEditingUri(null);
    setCategory("bird");
    setCommonName("");
    setScientificName("");
    setNote("");
    setMutationError(null);
  }, []);

  const loadOccurrences = useCallback(async (recording: AcAudioListItem) => {
    if (!sessionDid) return;
    setLoadingOccurrences(true);
    setMutationError(null);
    try {
      const items = await listAudioOccurrences(sessionDid, recording.uri);
      setOccurrences(items);
      setOccurrenceCounts((current) => ({ ...current, [recording.uri]: items.length }));
    } catch {
      setOccurrences([]);
      setMutationError(t("occurrencesLoadFailed"));
    } finally {
      setLoadingOccurrences(false);
    }
  }, [sessionDid, t]);

  useEffect(() => {
    setReady(null);
    setOccurrences([]);
    startFreshLabel(null);
    if (selectedRecording) void loadOccurrences(selectedRecording);
  }, [selectedRecording, loadOccurrences, startFreshLabel]);

  const selectExisting = (item: AudioOccurrenceItem) => {
    if (!ready) return;
    setDraftBox(boundsToBox(item, ready.durationSeconds, ready.maxFrequencyHz));
    setEditingUri(item.uri);
    setCategory(item.category);
    setCommonName(item.commonName);
    setScientificName(item.record.taxonRank === "species" ? item.scientificName : "");
    setNote(item.note);
    setMutationError(null);
  };

  const occurrenceSource = useMemo(() => {
    if (!selectedRecording || !ready) return null;
    const deployment = deployments.find((item) => item.uri === selectedRecording.deploymentRef);
    return {
      uri: selectedRecording.uri,
      cid: selectedRecording.cid,
      recordedAt: selectedRecording.recordedAt ?? "",
      durationSeconds: selectedRecording.durationSeconds ?? ready.durationSeconds,
      eventRef: deployment?.eventRef,
      siteRef: selectedRecording.siteRef ?? deployment?.siteRef,
      decimalLatitude: deployment?.decimalLatitude,
      decimalLongitude: deployment?.decimalLongitude,
    };
  }, [deployments, ready, selectedRecording]);

  const saveLabel = async () => {
    if (!draftBox || !ready || !occurrenceSource) return;
    setMutationPending(true);
    setMutationError(null);
    try {
      const draft: AudioOccurrenceDraft = {
        source: occurrenceSource,
        category,
        bounds: spectrogramBoxToBounds(draftBox, ready.durationSeconds, ready.maxFrequencyHz),
        commonName: commonName.trim() || undefined,
        scientificName: scientificName.trim() || undefined,
        note: note.trim() || undefined,
      };
      const existing = occurrences.find((item) => item.uri === editingUri);
      const saved = existing
        ? await updateAudioOccurrence(existing, draft)
        : await createAudioOccurrence(draft);
      setOccurrences((current) => [...current.filter((item) => item.uri !== saved.uri), saved].sort((a, b) => a.bounds.startTimeSeconds - b.bounds.startTimeSeconds));
      setOccurrenceCounts((current) => ({ ...current, [occurrenceSource.uri]: existing ? current[occurrenceSource.uri] ?? occurrences.length : (current[occurrenceSource.uri] ?? occurrences.length) + 1 }));
      startFreshLabel(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMutationError(code === "recording_time_missing" ? t("recordedAtMissing") : t("saveFailed"));
    } finally {
      setMutationPending(false);
    }
  };

  const removeLabel = async (item: AudioOccurrenceItem) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    setMutationPending(true);
    setMutationError(null);
    try {
      await deleteAudioOccurrence(item);
      setOccurrences((current) => current.filter((candidate) => candidate.uri !== item.uri));
      if (selectedRecording) {
        setOccurrenceCounts((current) => ({ ...current, [selectedRecording.uri]: Math.max(0, (current[selectedRecording.uri] ?? occurrences.length) - 1) }));
      }
      if (editingUri === item.uri) startFreshLabel(null);
    } catch {
      setMutationError(t("deleteFailed"));
    } finally {
      setMutationPending(false);
    }
  };

  const exportLabels = () => {
    if (!selectedRecording || occurrences.length === 0) return;
    const labels: AudioLabel[] = occurrences.map((item) => ({
      id: item.uri,
      fileKey: selectedRecording.uri,
      fileName: selectedRecording.name,
      category: item.category,
      species: item.commonName || item.scientificName,
      note: item.note,
      ...item.bounds,
      box: ready ? boundsToBox(item, ready.durationSeconds, ready.maxFrequencyHz) : { startX: 0, endX: 0, topY: 0, bottomY: 0 },
      createdAt: item.createdAt,
    }));
    downloadText(audioLabelsToCsv(labels), `${selectedRecording.name.replace(/\.wav$/i, "")}-occurrences.csv`);
  };

  const moveSelection = (offset: number) => {
    if (!recordings || selectedIndex < 0) return;
    const next = recordings[selectedIndex + offset];
    if (next) setSelectedUri(next.uri);
  };

  const editingItem = occurrences.find((item) => item.uri === editingUri) ?? null;
  const draftBounds = draftBox && ready ? spectrogramBoxToBounds(draftBox, ready.durationSeconds, ready.maxFrequencyHz) : null;
  const validRecordingTime = Boolean(occurrenceSource?.recordedAt && !Number.isNaN(new Date(occurrenceSource.recordedAt).getTime()));
  const canSave = Boolean(draftBox && ready && occurrenceSource && validRecordingTime && (category !== "note" || note.trim()) && !mutationPending);

  if (!sessionDid) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <h2 className="text-lg font-medium text-foreground">{t("signInTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("signInBody")}</p>
      </div>
    );
  }

  if (recordings === null) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/70 px-6 py-16 text-sm text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin text-primary" />
        {t("loadingRecordings")}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
        <WavesIcon className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-medium text-foreground">{t("noRecordingsTitle")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{workspaceError ?? t("noRecordingsBody")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild><Link href="/audiomoth?tab=upload"><UploadIcon className="size-4" />{t("uploadFirst")}</Link></Button>
          <Button variant="outline" onClick={() => void loadWorkspace()}><RefreshCwIcon className="size-4" />{t("refresh")}</Button>
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><WavesIcon className="size-4.5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("workspaceSummary", { files: recordings.length, labels: occurrences.length })}</p>
            <p className="truncate text-xs text-muted-foreground">{t("savedAtproto")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/audiomoth?tab=upload"><UploadIcon className="size-4" />{t("addFiles")}</Link></Button>
          <Button variant="outline" size="sm" disabled={occurrences.length === 0} onClick={exportLabels}><DownloadIcon className="size-4" />{t("export")}</Button>
          <Button variant="ghost" size="sm" onClick={() => void loadWorkspace()}><RefreshCwIcon className="size-4" />{t("refresh")}</Button>
        </div>
      </div>

      <div className="grid min-h-[680px] overflow-hidden rounded-3xl border border-border bg-card/80 xl:grid-cols-[230px_minmax(0,1fr)_310px]">
        <aside className="flex max-h-[760px] min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-r">
          <div className="border-b border-border p-3">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("recordings")}</p>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className="h-8 pl-8 text-xs" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {shownRecordings.map((recording) => {
              const count = occurrenceCounts[recording.uri];
              const active = recording.uri === selectedRecording?.uri;
              return (
                <button key={recording.uri} type="button" onClick={() => setSelectedUri(recording.uri)} className={cn("mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors", active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground") }>
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", count && count > 0 ? "bg-primary text-primary-foreground" : "bg-muted") }>
                    {count && count > 0 ? <CheckIcon className="size-3.5" /> : <WavesIcon className="size-3 opacity-60" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px]">{recording.name}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{count === undefined ? t("openToLoad") : count > 0 ? t("labelCount", { count }) : t("notLabelled")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 border-b border-border p-4 sm:p-5 xl:border-b-0 xl:border-r">
          {selectedRecording ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium text-foreground">{selectedRecording.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("filePosition", { current: selectedIndex + 1, total: recordings.length })}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => moveSelection(-1)} disabled={selectedIndex <= 0} className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={t("previousFile")}><ChevronLeftIcon className="size-4" /></button>
                  <button type="button" onClick={() => moveSelection(1)} disabled={selectedIndex >= recordings.length - 1} className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={t("nextFile")}><ChevronRightIcon className="size-4" /></button>
                </div>
              </div>

              <SpectrogramEditor
                sourceUrls={audioUrls}
                labels={occurrences}
                draftBox={draftBox}
                editingUri={editingUri}
                onReady={setReady}
                onDraftBox={startFreshLabel}
                onSelectLabel={selectExisting}
              />

              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">{t("labelsTitle", { count: occurrences.length })}</h3>
                  {loadingOccurrences ? <Loader2Icon className="size-4 animate-spin text-primary" /> : occurrences.length > 0 ? <span className="text-xs text-muted-foreground">{t("selectToEdit")}</span> : null}
                </div>
                {occurrences.length === 0 && !loadingOccurrences ? (
                  <div className="mt-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">{t("labelsEmpty")}</div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {occurrences.map((item) => (
                      <div key={item.uri} className={cn("flex items-center gap-2 rounded-xl border p-2.5", editingUri === item.uri ? "border-primary bg-primary/[0.04]" : "border-border") }>
                        <button type="button" onClick={() => selectExisting(item)} className="min-w-0 flex-1 text-left">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", CATEGORY_STYLES[item.category].chip)}>{t(`categories.${item.category}`)}</span>
                          <p className="mt-1 truncate text-xs font-medium text-foreground">{item.commonName || item.scientificName}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{formatTime(item.bounds.startTimeSeconds)}–{formatTime(item.bounds.endTimeSeconds)} · {formatFrequency(item.bounds.minFrequencyHz)}–{formatFrequency(item.bounds.maxFrequencyHz)}</p>
                        </button>
                        <span className="text-[10px] font-medium text-primary">{t("saved")}</span>
                        <button type="button" disabled={mutationPending} onClick={() => void removeLabel(item)} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40" aria-label={t("deleteLabel")}><Trash2Icon className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </main>

        <aside className="p-4 sm:p-5">
          <div className="sticky top-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{editingItem ? t("editLabel") : t("newLabel")}</p>
                <h3 className="mt-1 text-lg font-medium tracking-tight text-foreground">{draftBox ? t("describeSelection") : t("drawFirst")}</h3>
              </div>
              {draftBox ? <button type="button" onClick={() => startFreshLabel(null)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={t("clearSelection")}><XIcon className="size-4" /></button> : null}
            </div>

            {!draftBox ? (
              <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] p-4 text-sm leading-6 text-muted-foreground"><WavesIcon className="mb-3 size-5 text-primary" />{audioUrls.length > 0 ? t("drawHint") : t("audioUnavailable")}</div>
            ) : (
              <div className="mt-4 space-y-4">
                {draftBounds ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/70 p-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("timeRange")}</p><p className="mt-1 font-mono text-xs text-foreground">{formatTime(draftBounds.startTimeSeconds)} – {formatTime(draftBounds.endTimeSeconds)}</p></div>
                    <div className="rounded-xl bg-muted/70 p-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("frequencyRange")}</p><p className="mt-1 font-mono text-xs text-foreground">{formatFrequency(draftBounds.minFrequencyHz)} – {formatFrequency(draftBounds.maxFrequencyHz)}</p></div>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-medium text-foreground">{t("whatIsIt")}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {AUDIO_LABEL_CATEGORIES.map((value) => {
                      const Icon = CATEGORY_ICONS[value];
                      return <button key={value} type="button" data-testid={`label-category-${value}`} onClick={() => setCategory(value)} className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-medium transition-colors", category === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground") } aria-pressed={category === value}><Icon className="size-4" />{t(`categories.${value}`)}</button>;
                    })}
                  </div>
                </div>

                {category !== "note" ? (
                  <>
                    <label className="block space-y-1.5 text-xs font-medium text-foreground">{t("commonName")}<Input data-testid="label-common-name" value={commonName} onChange={(event) => setCommonName(event.target.value)} placeholder={t("commonNamePlaceholder")} className="font-normal" /></label>
                    <label className="block space-y-1.5 text-xs font-medium text-foreground">{t("scientificName")}<Input data-testid="label-scientific-name" value={scientificName} onChange={(event) => setScientificName(event.target.value)} placeholder={t("scientificNamePlaceholder")} className="font-normal italic" /><span className="block font-normal leading-5 text-muted-foreground">{t("scientificNameHint")}</span></label>
                  </>
                ) : null}

                <label className="block space-y-1.5 text-xs font-medium text-foreground">{category === "note" ? t("noteRequired") : t("noteOptional")}<Textarea data-testid="label-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("notePlaceholder")} rows={3} className="resize-none font-normal" /></label>

                {mutationError ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{mutationError}</p> : null}
                {!validRecordingTime ? <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{t("recordedAtMissing")}</p> : null}
                <Button data-testid="save-audio-label" className="w-full" disabled={!canSave} onClick={() => void saveLabel()}>{mutationPending ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}{editingItem ? t("updateLabel") : t("saveOccurrence")}</Button>
                <p className="text-center text-[10px] leading-4 text-muted-foreground">{t("saveAtprotoHint")}</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function SpectrogramEditor({
  sourceUrls,
  labels,
  draftBox,
  editingUri,
  onReady,
  onDraftBox,
  onSelectLabel,
}: {
  sourceUrls: string[];
  labels: AudioOccurrenceItem[];
  draftBox: NormalizedSpectrogramBox | null;
  editingUri: string | null;
  onReady: (ready: SpectrogramReady) => void;
  onDraftBox: (box: NormalizedSpectrogramBox | null) => void;
  onSelectLabel: (item: AudioOccurrenceItem) => void;
}) {
  const t = useTranslations("common.audiomoth.label");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const drawRef = useRef<DrawState | null>(null);
  const [loading, setLoading] = useState(sourceUrls.length > 0);
  const [failed, setFailed] = useState(sourceUrls.length === 0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [maxFrequency, setMaxFrequency] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(sourceUrls.length > 0);
    setFailed(sourceUrls.length === 0);
    setPlaybackUrl(null);
    setCurrentTime(0);
    if (sourceUrls.length === 0) return;

    async function render() {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("unsupported");
      const context = new AudioContextClass();
      try {
        let buffer: AudioBuffer | null = null;
        let resolvedUrl: string | null = null;
        for (const candidate of sourceUrls) {
          try {
            const response = await fetch(candidate);
            if (!response.ok) continue;
            buffer = await context.decodeAudioData(await response.arrayBuffer());
            resolvedUrl = candidate;
            break;
          } catch {
            /* Try the PDS preview when the archival original is unavailable. */
          }
        }
        if (!buffer || !resolvedUrl) throw new Error("audio_load_failed");
        setPlaybackUrl(resolvedUrl);
        if (cancelled) return;
        const channel = buffer.getChannelData(0);
        const samples = new Int16Array(channel.length);
        for (let index = 0; index < channel.length; index += 1) samples[index] = Math.round(Math.max(-1, Math.min(1, channel[index]!)) * 32_767);
        const hopSize = Math.max(256, Math.ceil(Math.max(1, samples.length - FFT_SIZE) / MAX_SPECTROGRAM_COLUMNS));
        const data = computeSpectrogram(samples, { fftSize: FFT_SIZE, hopSize });
        const canvas = canvasRef.current;
        if (!canvas || data.columns < 2) throw new Error("empty");
        canvas.width = data.columns;
        canvas.height = data.bins;
        const paint = canvas.getContext("2d");
        if (!paint) throw new Error("canvas");
        const image = paint.createImageData(data.columns, data.bins);
        for (let column = 0; column < data.columns; column += 1) {
          for (let bin = 0; bin < data.bins; bin += 1) {
            const [red, green, blue] = colorForSpectrogram((data.magnitudesDb[column * data.bins + bin]! + 100) / 80);
            const offset = ((data.bins - 1 - bin) * data.columns + column) * 4;
            image.data[offset] = Math.round(red); image.data[offset + 1] = Math.round(green); image.data[offset + 2] = Math.round(blue); image.data[offset + 3] = 255;
          }
        }
        paint.putImageData(image, 0, 0);
        const next = { durationSeconds: buffer.duration, maxFrequencyHz: buffer.sampleRate / 2 };
        setDuration(next.durationSeconds); setMaxFrequency(next.maxFrequencyHz); onReady(next);
      } finally {
        void context.close();
      }
    }

    const timer = window.setTimeout(() => {
      void render().catch(() => { if (!cancelled) setFailed(true); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 30);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [onReady, sourceUrls]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const beginDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (loading || failed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event); drawRef.current = { anchorX: point.x, anchorY: point.y }; onDraftBox(normalizeSpectrogramBox(point.x, point.y, point.x, point.y));
  };
  const continueDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawRef.current) return;
    const point = pointFromEvent(event); onDraftBox(normalizeSpectrogramBox(drawRef.current.anchorX, drawRef.current.anchorY, point.x, point.y));
  };
  const finishDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawRef.current) return;
    const point = pointFromEvent(event); const box = normalizeSpectrogramBox(drawRef.current.anchorX, drawRef.current.anchorY, point.x, point.y); drawRef.current = null;
    onDraftBox(box.endX - box.startX < MIN_BOX_SIZE || box.bottomY - box.topY < MIN_BOX_SIZE ? null : box);
  };
  const seekTo = (seconds: number) => { if (audioRef.current) { audioRef.current.currentTime = seconds; setCurrentTime(seconds); } };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 rounded-t-2xl border border-b-0 border-border bg-[#120f20] px-3 py-2 text-xs text-white/70"><span>{t("drawInstruction")}</span>{duration > 0 ? <span className="font-mono">{formatTime(duration)} · {formatFrequency(maxFrequency)}</span> : null}</div>
      <div className="flex min-h-[330px] overflow-hidden rounded-b-2xl border border-border bg-[#06040b]">
        <div className="flex w-12 shrink-0 flex-col justify-between border-r border-white/10 py-2 pr-2 text-right font-mono text-[9px] text-white/50">{[1, .75, .5, .25, 0].map((fraction) => <span key={fraction}>{maxFrequency ? formatFrequency(maxFrequency * fraction) : "—"}</span>)}</div>
        <div className="min-w-0 flex-1">
          <div className={cn("relative h-[300px] touch-none select-none overflow-hidden", loading ? "cursor-wait" : "cursor-crosshair")} onPointerDown={beginDraw} onPointerMove={continueDraw} onPointerUp={finishDraw} onPointerCancel={() => { drawRef.current = null; }} aria-label={t("spectrogramAria")}>
            <canvas ref={canvasRef} className="h-full w-full" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_24.8%,rgba(255,255,255,.08)_25%,transparent_25.2%,transparent_49.8%,rgba(255,255,255,.08)_50%,transparent_50.2%,transparent_74.8%,rgba(255,255,255,.08)_75%,transparent_75.2%),linear-gradient(to_bottom,transparent_24.8%,rgba(255,255,255,.08)_25%,transparent_25.2%,transparent_49.8%,rgba(255,255,255,.08)_50%,transparent_50.2%,transparent_74.8%,rgba(255,255,255,.08)_75%,transparent_75.2%)]" />
            {duration > 0 ? <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80 shadow-[0_0_7px_rgba(255,255,255,.7)]" style={{ left: `${(currentTime / duration) * 100}%` }} /> : null}
            {labels.map((item) => {
              const box = boundsToBox(item, duration || 1, maxFrequency || 1);
              return <button key={item.uri} type="button" onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelectLabel(item); seekTo(item.bounds.startTimeSeconds); }} className={cn("absolute z-10 border-2 transition-colors", CATEGORY_STYLES[item.category].box, editingUri === item.uri && "ring-2 ring-white ring-offset-1 ring-offset-transparent")} style={{ left: `${box.startX * 100}%`, top: `${box.topY * 100}%`, width: `${(box.endX - box.startX) * 100}%`, height: `${(box.bottomY - box.topY) * 100}%` }} aria-label={item.commonName || item.scientificName} />;
            })}
            {draftBox ? <div className="pointer-events-none absolute z-20 border-2 border-white bg-white/15 shadow-[0_0_0_1px_rgba(0,0,0,.35),0_0_16px_rgba(255,255,255,.25)]" style={{ left: `${draftBox.startX * 100}%`, top: `${draftBox.topY * 100}%`, width: `${(draftBox.endX - draftBox.startX) * 100}%`, height: `${(draftBox.bottomY - draftBox.topY) * 100}%` }} /> : null}
            {loading ? <div className="absolute inset-0 grid place-items-center bg-[#080611]/85 text-center text-sm text-white/70 backdrop-blur-sm"><span><Loader2Icon className="mx-auto mb-2 size-5 animate-spin text-primary" />{t("buildingSpectrogram")}</span></div> : null}
            {failed ? <div className="absolute inset-0 grid place-items-center bg-[#080611] px-6 text-center text-sm text-white/60">{t("spectrogramFailed")}</div> : null}
          </div>
          <div className="flex justify-between border-t border-white/10 px-1.5 py-1.5 font-mono text-[9px] text-white/50">{[0, .25, .5, .75, 1].map((fraction) => <span key={fraction}>{duration ? formatTime(duration * fraction) : "—"}</span>)}</div>
        </div>
      </div>
      {playbackUrl ? <audio ref={audioRef} src={playbackUrl} controls preload="metadata" className="mt-3 h-10 w-full" onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}>{t("audioUnsupported")}</audio> : null}
    </div>
  );
}
