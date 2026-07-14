"use client";

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
  FolderOpenIcon,
  Loader2Icon,
  NotebookPenIcon,
  PawPrintIcon,
  PlayIcon,
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
  audioFileKey,
  audioLabelsToCsv,
  normalizeSpectrogramBox,
  spectrogramBoxToBounds,
  type AudioLabel,
  type AudioLabelCategory,
  type NormalizedSpectrogramBox,
} from "@/app/_lib/audiomoth/labels";
import { colorForSpectrogram, computeSpectrogram } from "@/app/_lib/audiomoth/spectrogram";

const STORAGE_KEY = "gainforest:audiomoth-labels:v1";
const MAX_SPECTROGRAM_COLUMNS = 1_100;
const FFT_SIZE = 1_024;
const MIN_BOX_SIZE = 0.006;

type LabelStore = Record<string, AudioLabel[]>;

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

function isWav(file: File): boolean {
  return /\.wav$/i.test(file.name) && !file.name.startsWith(".");
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

function downloadText(content: string, filename: string, type: string): void {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

async function collectDroppedFiles(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];

  async function walk(entry: unknown): Promise<void> {
    const item = entry as {
      name?: string;
      isFile?: boolean;
      isDirectory?: boolean;
      file?: (done: (file: File) => void, fail: () => void) => void;
      createReader?: () => { readEntries: (done: (entries: unknown[]) => void, fail: () => void) => void };
    };
    if (!item || item.name?.startsWith(".")) return;
    if (item.isFile && item.file) {
      const file = await new Promise<File | null>((resolve) => item.file!(resolve, () => resolve(null)));
      if (file) files.push(file);
      return;
    }
    if (item.isDirectory && item.createReader) {
      const reader = item.createReader();
      for (;;) {
        const entries = await new Promise<unknown[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (entries.length === 0) break;
        for (const child of entries) await walk(child);
      }
    }
  }

  for (const item of Array.from(items)) {
    const entry = (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.();
    if (entry) await walk(entry);
    else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export function LabelTab() {
  const t = useTranslations("common.audiomoth.label");
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [labels, setLabels] = useState<LabelStore>({});
  const [storageReady, setStorageReady] = useState(false);
  const [ready, setReady] = useState<SpectrogramReady | null>(null);
  const [draftBox, setDraftBox] = useState<NormalizedSpectrogramBox | null>(null);
  const [category, setCategory] = useState<AudioLabelCategory>("bird");
  const [species, setSpecies] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLabels(JSON.parse(saved) as LabelStore);
    } catch {
      /* A private browser session can deny storage; the workspace still works. */
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
    } catch {
      /* Keep labels in memory when local storage is unavailable. */
    }
  }, [labels, storageReady]);

  const addFiles = useCallback((incoming: File[]) => {
    const wavs = incoming.filter(isWav);
    if (wavs.length === 0) return;
    setFiles((current) => {
      const next = new Map(current.map((file) => [audioFileKey(file), file]));
      for (const file of wavs) next.set(audioFileKey(file), file);
      return [...next.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelectedKey((current) => current ?? audioFileKey(wavs[0]!));
  }, []);

  const selectedFile = useMemo(
    () => files.find((file) => audioFileKey(file) === selectedKey) ?? files[0] ?? null,
    [files, selectedKey],
  );
  const currentKey = selectedFile ? audioFileKey(selectedFile) : null;
  const currentLabels = useMemo(
    () => (currentKey ? labels[currentKey] ?? [] : []).slice().sort((a, b) => a.startTimeSeconds - b.startTimeSeconds),
    [currentKey, labels],
  );
  const allLabels = useMemo(() => {
    const openFileKeys = new Set(files.map(audioFileKey));
    return Object.entries(labels).flatMap(([key, stored]) => openFileKeys.has(key) ? stored : []);
  }, [files, labels]);
  const shownFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? files.filter((file) => file.name.toLowerCase().includes(normalized)) : files;
  }, [files, query]);
  const selectedIndex = selectedFile ? files.findIndex((file) => audioFileKey(file) === audioFileKey(selectedFile)) : -1;

  const startFreshLabel = useCallback((box: NormalizedSpectrogramBox | null) => {
    setDraftBox(box);
    setEditingId(null);
    setCategory("bird");
    setSpecies("");
    setNote("");
  }, []);

  useEffect(() => {
    setReady(null);
    startFreshLabel(null);
  }, [currentKey, startFreshLabel]);

  const selectExisting = (label: AudioLabel) => {
    setDraftBox(label.box);
    setEditingId(label.id);
    setCategory(label.category);
    setSpecies(label.species);
    setNote(label.note);
  };

  const saveLabel = () => {
    if (!selectedFile || !currentKey || !ready || !draftBox) return;
    const bounds = spectrogramBoxToBounds(draftBox, ready.durationSeconds, ready.maxFrequencyHz);
    const existing = currentLabels.find((label) => label.id === editingId);
    const next: AudioLabel = {
      id: existing?.id ?? crypto.randomUUID(),
      fileKey: currentKey,
      fileName: selectedFile.name,
      category,
      species: species.trim(),
      note: note.trim(),
      ...bounds,
      box: draftBox,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    setLabels((current) => ({
      ...current,
      [currentKey]: [...(current[currentKey] ?? []).filter((label) => label.id !== next.id), next],
    }));
    startFreshLabel(null);
  };

  const deleteLabel = (id: string) => {
    if (!currentKey) return;
    setLabels((current) => ({
      ...current,
      [currentKey]: (current[currentKey] ?? []).filter((label) => label.id !== id),
    }));
    if (editingId === id) startFreshLabel(null);
  };

  const moveSelection = (offset: number) => {
    if (selectedIndex < 0) return;
    const next = files[selectedIndex + offset];
    if (next) setSelectedKey(audioFileKey(next));
  };

  const exportLabels = () => {
    if (allLabels.length === 0) return;
    downloadText(audioLabelsToCsv(allLabels), "audiomoth-labels.csv", "text/csv;charset=utf-8");
  };

  const draftBounds = draftBox && ready
    ? spectrogramBoxToBounds(draftBox, ready.durationSeconds, ready.maxFrequencyHz)
    : null;
  const canSave = Boolean(draftBox && ready && (category !== "note" || note.trim()));

  return (
    <section className="flex flex-col gap-4">
      <input
        ref={folderInputRef}
        data-testid="label-folder-input"
        type="file"
        className="hidden"
        // @ts-expect-error supported by Chromium, Safari and desktop Firefox
        webkitdirectory=""
        multiple
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={filesInputRef}
        data-testid="label-files-input"
        type="file"
        className="hidden"
        accept=".wav,audio/wav,audio/x-wav"
        multiple
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {files.length === 0 ? (
        <div>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {[t("stepImport"), t("stepDraw"), t("stepDescribe")].map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-foreground">{step}</span>
              </div>
            ))}
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => folderInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") folderInputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void collectDroppedFiles(event.dataTransfer.items).then(addFiles);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-colors",
              dragging ? "border-primary bg-primary/[0.06]" : "border-border bg-card/60 hover:border-primary/50 hover:bg-primary/[0.03]",
            )}
          >
            <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
              <WavesIcon className="size-8" />
            </span>
            <h2 className="mt-5 text-xl font-medium tracking-tight text-foreground">{t("emptyTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("emptyBody")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  folderInputRef.current?.click();
                }}
              >
                <FolderOpenIcon className="size-4" />
                {t("chooseFolder")}
              </Button>
              <Button
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  filesInputRef.current?.click();
                }}
              >
                <UploadIcon className="size-4" />
                {t("chooseFiles")}
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("privacyNote")}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <WavesIcon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("workspaceSummary", { files: files.length, labels: allLabels.length })}</p>
                <p className="truncate text-xs text-muted-foreground">{t("savedLocally")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => filesInputRef.current?.click()}>
                <UploadIcon className="size-4" />
                {t("addFiles")}
              </Button>
              <Button variant="outline" size="sm" disabled={allLabels.length === 0} onClick={exportLabels}>
                <DownloadIcon className="size-4" />
                {t("export")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                {t("closeSet")}
              </Button>
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
                {shownFiles.map((file) => {
                  const key = audioFileKey(file);
                  const count = labels[key]?.length ?? 0;
                  const active = key === currentKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                        active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", count > 0 ? "bg-primary text-primary-foreground" : "bg-muted") }>
                        {count > 0 ? <CheckIcon className="size-3.5" /> : <PlayIcon className="ml-0.5 size-3 opacity-60" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[11px]">{file.name}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{count > 0 ? t("labelCount", { count }) : t("notLabelled")}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="min-w-0 border-b border-border p-4 sm:p-5 xl:border-b-0 xl:border-r">
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("filePosition", { current: selectedIndex + 1, total: files.length })}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => moveSelection(-1)} disabled={selectedIndex <= 0} className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={t("previousFile")}>
                        <ChevronLeftIcon className="size-4" />
                      </button>
                      <button type="button" onClick={() => moveSelection(1)} disabled={selectedIndex >= files.length - 1} className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={t("nextFile")}>
                        <ChevronRightIcon className="size-4" />
                      </button>
                    </div>
                  </div>

                  <SpectrogramEditor
                    file={selectedFile}
                    labels={currentLabels}
                    draftBox={draftBox}
                    editingId={editingId}
                    onReady={setReady}
                    onDraftBox={(box) => startFreshLabel(box)}
                    onSelectLabel={selectExisting}
                  />

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-foreground">{t("labelsTitle", { count: currentLabels.length })}</h3>
                      {currentLabels.length > 0 ? <span className="text-xs text-muted-foreground">{t("selectToEdit")}</span> : null}
                    </div>
                    {currentLabels.length === 0 ? (
                      <div className="mt-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                        {t("labelsEmpty")}
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {currentLabels.map((label) => (
                          <div key={label.id} className={cn("flex items-center gap-2 rounded-xl border p-2.5", editingId === label.id ? "border-primary bg-primary/[0.04]" : "border-border") }>
                            <button type="button" onClick={() => selectExisting(label)} className="min-w-0 flex-1 text-left">
                              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", CATEGORY_STYLES[label.category].chip)}>{t(`categories.${label.category}`)}</span>
                              <p className="mt-1 truncate text-xs font-medium text-foreground">{label.species || label.note || t(`categories.${label.category}`)}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{formatTime(label.startTimeSeconds)}–{formatTime(label.endTimeSeconds)} · {formatFrequency(label.minFrequencyHz)}–{formatFrequency(label.maxFrequencyHz)}</p>
                            </button>
                            <button type="button" onClick={() => deleteLabel(label.id)} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t("deleteLabel")}>
                              <Trash2Icon className="size-3.5" />
                            </button>
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
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{editingId ? t("editLabel") : t("newLabel")}</p>
                    <h3 className="mt-1 text-lg font-medium tracking-tight text-foreground">{draftBox ? t("describeSelection") : t("drawFirst")}</h3>
                  </div>
                  {draftBox ? (
                    <button type="button" onClick={() => startFreshLabel(null)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={t("clearSelection")}>
                      <XIcon className="size-4" />
                    </button>
                  ) : null}
                </div>

                {!draftBox ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] p-4 text-sm leading-6 text-muted-foreground">
                    <WavesIcon className="mb-3 size-5 text-primary" />
                    {t("drawHint")}
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {draftBounds ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-muted/70 p-2.5">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("timeRange")}</p>
                          <p className="mt-1 font-mono text-xs text-foreground">{formatTime(draftBounds.startTimeSeconds)} – {formatTime(draftBounds.endTimeSeconds)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/70 p-2.5">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("frequencyRange")}</p>
                          <p className="mt-1 font-mono text-xs text-foreground">{formatFrequency(draftBounds.minFrequencyHz)} – {formatFrequency(draftBounds.maxFrequencyHz)}</p>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <p className="mb-2 text-xs font-medium text-foreground">{t("whatIsIt")}</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {AUDIO_LABEL_CATEGORIES.map((value) => {
                          const Icon = CATEGORY_ICONS[value];
                          return (
                            <button
                              key={value}
                              type="button"
                              data-testid={`label-category-${value}`}
                              onClick={() => setCategory(value)}
                              className={cn(
                                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-medium transition-colors",
                                category === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                              aria-pressed={category === value}
                            >
                              <Icon className="size-4" />
                              {t(`categories.${value}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {category !== "note" ? (
                      <label className="block space-y-1.5 text-xs font-medium text-foreground">
                        {t("species")}
                        <Input data-testid="label-species" value={species} onChange={(event) => setSpecies(event.target.value)} placeholder={t("speciesPlaceholder")} className="font-normal" />
                        <span className="block font-normal leading-5 text-muted-foreground">{t("speciesHint")}</span>
                      </label>
                    ) : null}

                    <label className="block space-y-1.5 text-xs font-medium text-foreground">
                      {category === "note" ? t("noteRequired") : t("noteOptional")}
                      <Textarea data-testid="label-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("notePlaceholder")} rows={3} className="resize-none font-normal" />
                    </label>

                    <Button data-testid="save-audio-label" className="w-full" disabled={!canSave} onClick={saveLabel}>
                      <CheckIcon className="size-4" />
                      {editingId ? t("updateLabel") : t("saveLabel")}
                    </Button>
                    <p className="text-center text-[10px] leading-4 text-muted-foreground">{t("saveHint")}</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function SpectrogramEditor({
  file,
  labels,
  draftBox,
  editingId,
  onReady,
  onDraftBox,
  onSelectLabel,
}: {
  file: File;
  labels: AudioLabel[];
  draftBox: NormalizedSpectrogramBox | null;
  editingId: string | null;
  onReady: (ready: SpectrogramReady) => void;
  onDraftBox: (box: NormalizedSpectrogramBox | null) => void;
  onSelectLabel: (label: AudioLabel) => void;
}) {
  const t = useTranslations("common.audiomoth.label");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const drawRef = useRef<DrawState | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [maxFrequency, setMaxFrequency] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setCurrentTime(0);

    async function render() {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("unsupported");
      const context = new AudioContextClass();
      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (cancelled) return;
        const channel = buffer.getChannelData(0);
        const samples = new Int16Array(channel.length);
        for (let index = 0; index < channel.length; index += 1) {
          samples[index] = Math.round(Math.max(-1, Math.min(1, channel[index]!)) * 32_767);
        }
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
            const db = data.magnitudesDb[column * data.bins + bin]!;
            const [red, green, blue] = colorForSpectrogram((db + 100) / 80);
            const y = data.bins - 1 - bin;
            const offset = (y * data.columns + column) * 4;
            image.data[offset] = Math.round(red);
            image.data[offset + 1] = Math.round(green);
            image.data[offset + 2] = Math.round(blue);
            image.data[offset + 3] = 255;
          }
        }
        paint.putImageData(image, 0, 0);
        const next = { durationSeconds: buffer.duration, maxFrequencyHz: buffer.sampleRate / 2 };
        setDuration(next.durationSeconds);
        setMaxFrequency(next.maxFrequencyHz);
        onReady(next);
      } finally {
        void context.close();
      }
    }

    const timer = window.setTimeout(() => {
      void render()
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 30);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [file, onReady]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const beginDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (loading || failed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    drawRef.current = { anchorX: point.x, anchorY: point.y };
    onDraftBox(normalizeSpectrogramBox(point.x, point.y, point.x, point.y));
  };

  const continueDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drawing = drawRef.current;
    if (!drawing) return;
    const point = pointFromEvent(event);
    onDraftBox(normalizeSpectrogramBox(drawing.anchorX, drawing.anchorY, point.x, point.y));
  };

  const finishDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drawing = drawRef.current;
    if (!drawing) return;
    const point = pointFromEvent(event);
    const box = normalizeSpectrogramBox(drawing.anchorX, drawing.anchorY, point.x, point.y);
    drawRef.current = null;
    if (box.endX - box.startX < MIN_BOX_SIZE || box.bottomY - box.topY < MIN_BOX_SIZE) {
      onDraftBox(null);
      return;
    }
    onDraftBox(box);
  };

  const seekTo = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 rounded-t-2xl border border-b-0 border-border bg-[#120f20] px-3 py-2 text-xs text-white/70">
        <span>{t("drawInstruction")}</span>
        {duration > 0 ? <span className="font-mono">{formatTime(duration)} · {formatFrequency(maxFrequency)}</span> : null}
      </div>
      <div className="flex min-h-[330px] overflow-hidden rounded-b-2xl border border-border bg-[#06040b]">
        <div className="flex w-12 shrink-0 flex-col justify-between border-r border-white/10 py-2 pr-2 text-right font-mono text-[9px] text-white/50">
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => <span key={fraction}>{maxFrequency ? formatFrequency(maxFrequency * fraction) : "—"}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn("relative h-[300px] touch-none select-none overflow-hidden", loading ? "cursor-wait" : "cursor-crosshair")}
            onPointerDown={beginDraw}
            onPointerMove={continueDraw}
            onPointerUp={finishDraw}
            onPointerCancel={() => {
              drawRef.current = null;
            }}
            aria-label={t("spectrogramAria")}
          >
            <canvas ref={canvasRef} className="h-full w-full" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_24.8%,rgba(255,255,255,.08)_25%,transparent_25.2%,transparent_49.8%,rgba(255,255,255,.08)_50%,transparent_50.2%,transparent_74.8%,rgba(255,255,255,.08)_75%,transparent_75.2%),linear-gradient(to_bottom,transparent_24.8%,rgba(255,255,255,.08)_25%,transparent_25.2%,transparent_49.8%,rgba(255,255,255,.08)_50%,transparent_50.2%,transparent_74.8%,rgba(255,255,255,.08)_75%,transparent_75.2%)]" />
            {duration > 0 ? <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80 shadow-[0_0_7px_rgba(255,255,255,.7)]" style={{ left: `${(currentTime / duration) * 100}%` }} /> : null}
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectLabel(label);
                  seekTo(label.startTimeSeconds);
                }}
                className={cn("absolute z-10 border-2 transition-colors", CATEGORY_STYLES[label.category].box, editingId === label.id && "ring-2 ring-white ring-offset-1 ring-offset-transparent")}
                style={{
                  left: `${label.box.startX * 100}%`,
                  top: `${label.box.topY * 100}%`,
                  width: `${(label.box.endX - label.box.startX) * 100}%`,
                  height: `${(label.box.bottomY - label.box.topY) * 100}%`,
                }}
                aria-label={label.species || label.note || t(`categories.${label.category}`)}
              />
            ))}
            {draftBox ? (
              <div
                className="pointer-events-none absolute z-20 border-2 border-white bg-white/15 shadow-[0_0_0_1px_rgba(0,0,0,.35),0_0_16px_rgba(255,255,255,.25)]"
                style={{
                  left: `${draftBox.startX * 100}%`,
                  top: `${draftBox.topY * 100}%`,
                  width: `${(draftBox.endX - draftBox.startX) * 100}%`,
                  height: `${(draftBox.bottomY - draftBox.topY) * 100}%`,
                }}
              />
            ) : null}
            {loading ? (
              <div className="absolute inset-0 grid place-items-center bg-[#080611]/85 text-center text-sm text-white/70 backdrop-blur-sm">
                <span><Loader2Icon className="mx-auto mb-2 size-5 animate-spin text-primary" />{t("buildingSpectrogram")}</span>
              </div>
            ) : null}
            {failed ? <div className="absolute inset-0 grid place-items-center bg-[#080611] px-6 text-center text-sm text-white/60">{t("spectrogramFailed")}</div> : null}
          </div>
          <div className="flex justify-between border-t border-white/10 px-1.5 py-1.5 font-mono text-[9px] text-white/50">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction}>{duration ? formatTime(duration * fraction) : "—"}</span>)}
          </div>
        </div>
      </div>
      {url ? (
        <audio
          ref={audioRef}
          src={url}
          controls
          preload="metadata"
          className="mt-3 h-10 w-full"
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
        >
          {t("audioUnsupported")}
        </audio>
      ) : null}
    </div>
  );
}
