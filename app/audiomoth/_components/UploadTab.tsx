"use client";

/**
 * The AudioMoth page's Upload tab — SD-card ingest inspired by the Arbimon
 * uploader. Pick the card (or any folder of recordings); every WAV header is
 * parsed client-side and the acoustic-chime deployment ID embedded by the
 * firmware is matched against the user's `dwc.event` deployments, so the
 * card is recognised the moment it is read.
 *
 * Upload pipeline per file (never through the Next.js server):
 *   1. presigned PUT — the full WAV goes browser → object storage
 *   2. a compact 8 kHz preview is encoded locally → PDS blob
 *   3. an `ac.audio` record links preview + archival copy to the
 *      `ac.deployment` (created on the fly from the matched event if needed)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLinesIcon,
  CheckIcon,
  CircleAlertIcon,
  FolderOpenIcon,
  HardDriveIcon,
  Loader2Icon,
  MapPinIcon,
  SkipForwardIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  encodeWav,
  extractPreviewSamples,
  PREVIEW_SAMPLE_RATE,
  readAudioMothInfo,
  type AudioMothRecordingInfo,
} from "@/app/_lib/audiomoth/wav-metadata";
import { renderSpectrogramPng } from "@/app/_lib/audiomoth/spectrogram";
import {
  listDeploymentEvents,
  type DeploymentEventItem,
} from "@/app/_lib/deployment-events";
import {
  createAcDeployment,
  listAcDeployments,
  type AcDeploymentItem,
} from "@/app/_lib/ac-deployment";
import {
  createAcAudioRecord,
  listUploadedRecordingNames,
  uploadPreviewBlob,
} from "@/app/_lib/ac-audio";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Stage = "pick" | "scanning" | "review" | "uploading" | "done";

type FileStatus = "queued" | "skipped" | "uploading" | "saving" | "done" | "error";

interface ScannedRecording {
  id: string;
  file: File;
  info: AudioMothRecordingInfo | null;
  status: FileStatus;
  /** 0–1 for the storage PUT. */
  progress: number;
  error?: string;
}

const CONCURRENCY = 2;
const PRESIGN_CHUNK = 50;
const LIST_RENDER_CAP = 120;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Recording time: comment timestamp → filename pattern → file mtime. */
function recordingTime(rec: ScannedRecording): Date {
  if (rec.info?.recordedAt) return rec.info.recordedAt;
  const match = rec.file.name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, y, mo, d, h, mi, s] = match;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }
  return new Date(rec.file.lastModified);
}

function isWavName(name: string): boolean {
  return /\.wav$/i.test(name) && !name.startsWith("._") && !name.startsWith(".");
}

/** Recursively collect files from a drag-and-dropped directory entry. */
async function collectDroppedFiles(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];

  async function walkEntry(entry: unknown): Promise<void> {
    const e = entry as {
      isFile?: boolean;
      isDirectory?: boolean;
      file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
      createReader?: () => { readEntries: (cb: (entries: unknown[]) => void, err: (e: unknown) => void) => void };
    };
    if (e?.isFile && e.file) {
      const file = await new Promise<File | null>((resolve) => e.file!(resolve, () => resolve(null)));
      if (file) out.push(file);
    } else if (e?.isDirectory && e.createReader) {
      const reader = e.createReader();
      // readEntries returns batches; keep reading until empty
      for (;;) {
        const batch = await new Promise<unknown[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (batch.length === 0) break;
        for (const child of batch) await walkEntry(child);
      }
    }
  }

  const entries: unknown[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const entry = (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  for (const entry of entries) await walkEntry(entry);
  return out;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function UploadTab({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.audiomoth.upload");

  const [stage, setStage] = useState<Stage>("pick");
  const [recordings, setRecordings] = useState<ScannedRecording[]>([]);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [events, setEvents] = useState<DeploymentEventItem[] | null>(null);
  const [manualEventUri, setManualEventUri] = useState<string>("none");
  const [makePreviews, setMakePreviews] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);
  const activeXhrsRef = useRef(new Set<XMLHttpRequest>());
  const acDeploymentsRef = useRef<AcDeploymentItem[] | null>(null);

  /* ---------------- deployments for matching ---------------- */

  useEffect(() => {
    if (!sessionDid) return;
    const ctrl = new AbortController();
    listDeploymentEvents(sessionDid, ctrl.signal)
      .then((list) => setEvents(list))
      .catch(() => setEvents([]));
    return () => ctrl.abort();
  }, [sessionDid]);

  /* ---------------- scanning ---------------- */

  const scanFiles = useCallback(async (files: File[]) => {
    const wavs = files.filter((f) => isWavName(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    setGlobalError(null);
    setRecordings([]);
    setUploadedBytes(0);
    if (wavs.length === 0) {
      setStage("review");
      return;
    }
    setStage("scanning");
    setScanProgress({ done: 0, total: wavs.length });

    const scanned: ScannedRecording[] = [];
    const BATCH = 8;
    for (let i = 0; i < wavs.length; i += BATCH) {
      const batch = wavs.slice(i, i + BATCH);
      const infos = await Promise.all(batch.map((file) => readAudioMothInfo(file).catch(() => null)));
      batch.forEach((file, j) => {
        scanned.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          info: infos[j],
          status: "queued",
          progress: 0,
        });
      });
      setScanProgress({ done: Math.min(i + BATCH, wavs.length), total: wavs.length });
    }

    setRecordings(scanned);
    setStage("review");
  }, []);

  const pickFolder = useCallback(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }
    try {
      const dir = await picker.call(window);
      const files: File[] = [];
      async function walk(handle: unknown): Promise<void> {
        const h = handle as {
          kind: string;
          values?: () => AsyncIterable<unknown>;
          getFile?: () => Promise<File>;
        };
        if (h.kind === "file" && h.getFile) {
          files.push(await h.getFile());
        } else if (h.kind === "directory" && h.values) {
          for await (const child of h.values()) await walk(child);
        }
      }
      await walk(dir);
      await scanFiles(files);
    } catch {
      /* user dismissed the picker */
    }
  }, [scanFiles]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.items?.length
        ? await collectDroppedFiles(event.dataTransfer.items)
        : Array.from(event.dataTransfer.files);
      if (dropped.length > 0) await scanFiles(dropped);
    },
    [scanFiles],
  );

  /* ---------------- grouping + matching ---------------- */

  const groups = useMemo(() => {
    const map = new Map<string, ScannedRecording[]>();
    for (const rec of recordings) {
      if (!rec.info) continue; // unreadable — surfaced separately
      const key = rec.info.deploymentId ?? "";
      const list = map.get(key) ?? [];
      list.push(rec);
      map.set(key, list);
    }
    return map;
  }, [recordings]);

  const unreadableCount = useMemo(() => recordings.filter((r) => !r.info).length, [recordings]);

  const matchFor = useCallback(
    (deploymentId: string): DeploymentEventItem | null =>
      events?.find((e) => e.eventID.toLowerCase() === deploymentId) ?? null,
    [events],
  );

  const manualEvent = useMemo(
    () => events?.find((e) => e.uri === manualEventUri) ?? null,
    [events, manualEventUri],
  );

  const stats = useMemo(() => {
    const readable = recordings.filter((r) => r.info);
    const totalBytes = readable.reduce((sum, r) => sum + r.file.size, 0);
    const times = readable.map((r) => recordingTime(r).getTime()).sort((a, b) => a - b);
    const devices = new Set(readable.map((r) => r.info?.deviceId).filter(Boolean) as string[]);
    return {
      count: readable.length,
      totalBytes,
      first: times.length ? new Date(times[0]!) : null,
      last: times.length ? new Date(times[times.length - 1]!) : null,
      devices: [...devices],
    };
  }, [recordings]);

  /* ---------------- upload pipeline ---------------- */

  const setRecording = useCallback((id: string, patch: Partial<ScannedRecording>) => {
    setRecordings((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /** Find or create the ac.deployment for a matched chime event. */
  const resolveAcDeployment = useCallback(
    async (event: DeploymentEventItem): Promise<string | null> => {
      if (!sessionDid) return null;
      if (!acDeploymentsRef.current) {
        acDeploymentsRef.current = await listAcDeployments(sessionDid).catch(() => []);
      }
      const existing = acDeploymentsRef.current.find((d) => d.eventRef === event.uri);
      if (existing) return existing.uri;
      try {
        const created = await createAcDeployment({
          name: event.locality ?? `AudioMoth ${event.eventID}`,
          deployedAt: new Date(event.eventDate),
          lat: event.decimalLatitude ? Number(event.decimalLatitude) : undefined,
          lon: event.decimalLongitude ? Number(event.decimalLongitude) : undefined,
          eventUri: event.uri,
          remarks: t("deploymentFallback"),
        });
        acDeploymentsRef.current = null; // refresh next time
        return created.uri;
      } catch {
        return null;
      }
    },
    [sessionDid, t],
  );

  const putToStorage = useCallback(
    (rec: ScannedRecording, url: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeXhrsRef.current.add(xhr);
        xhr.open("PUT", url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setRecording(rec.id, { progress: e.loaded / e.total });
        };
        xhr.onload = () => {
          activeXhrsRef.current.delete(xhr);
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`storage_${xhr.status}`));
        };
        xhr.onerror = () => {
          activeXhrsRef.current.delete(xhr);
          reject(new Error("storage_network"));
        };
        xhr.onabort = () => {
          activeXhrsRef.current.delete(xhr);
          reject(new Error("aborted"));
        };
        xhr.send(rec.file);
      }),
    [setRecording],
  );

  const startUpload = useCallback(async () => {
    if (!sessionDid) return;
    setGlobalError(null);
    setStage("uploading");
    cancelRef.current = false;
    setUploadedBytes(0);

    type Job = { rec: ScannedRecording; key: string; url: string; deploymentRef: string | null };
    const jobs: Job[] = [];

    try {
      for (const [deploymentId, groupFiles] of groups) {
        if (cancelRef.current) break;
        const event = deploymentId ? matchFor(deploymentId) : manualEvent;
        const deploymentRef = event ? await resolveAcDeployment(event) : null;

        // Skip files already uploaded for this deployment (re-inserted card).
        let existingNames = new Set<string>();
        if (deploymentRef) {
          existingNames = await listUploadedRecordingNames(sessionDid, deploymentRef).catch(() => new Set<string>());
        }

        const pending = groupFiles.filter((rec) => {
          if (existingNames.has(rec.file.name)) {
            setRecording(rec.id, { status: "skipped" });
            return false;
          }
          return true;
        });

        // Presign in chunks — direct browser→bucket PUTs.
        for (let i = 0; i < pending.length; i += PRESIGN_CHUNK) {
          const chunk = pending.slice(i, i + PRESIGN_CHUNK);
          const res = await fetch("/api/audiomoth/recordings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              deploymentId: deploymentId || undefined,
              files: chunk.map((rec) => ({ name: rec.file.name, sizeBytes: rec.file.size })),
            }),
          });
          const json = (await res.json().catch(() => null)) as {
            error?: string;
            uploads?: Array<{ name: string; key?: string; url?: string; error?: string }>;
          } | null;
          if (!res.ok || !json?.uploads) {
            throw new Error(json?.error === "not_configured" ? "not_configured" : "presign_failed");
          }
          chunk.forEach((rec, j) => {
            const upload = json.uploads![j];
            if (upload?.key && upload.url) {
              jobs.push({ rec, key: upload.key, url: upload.url, deploymentRef });
            } else {
              setRecording(rec.id, { status: "error", error: t("uploadFailed") });
            }
          });
        }
      }
    } catch (err) {
      setGlobalError(err instanceof Error && err.message === "not_configured" ? t("notConfigured") : t("uploadFailed"));
      setStage("review");
      return;
    }

    const queue = [...jobs];
    const worker = async () => {
      for (;;) {
        if (cancelRef.current) return;
        const job = queue.shift();
        if (!job) return;
        const { rec, key, url, deploymentRef } = job;
        try {
          setRecording(rec.id, { status: "uploading", progress: 0 });
          await putToStorage(rec, url);
          setRecording(rec.id, { status: "saving", progress: 1 });

          let previewBlob = null;
          let spectrogramBlob = null;
          if (makePreviews && rec.info) {
            try {
              const samples = await extractPreviewSamples(rec.file, rec.info);
              if (samples) {
                previewBlob = await uploadPreviewBlob(encodeWav(samples, PREVIEW_SAMPLE_RATE));
                const png = await renderSpectrogramPng(samples);
                if (png) spectrogramBlob = await uploadPreviewBlob(png, "image/png");
              }
            } catch {
              /* preview + spectrogram are best-effort — the archival copy is already safe */
            }
          }

          const info = rec.info!;
          await createAcAudioRecord({
            name: rec.file.name,
            metadata: {
              codec: "PCM",
              channels: info.channels,
              duration: info.durationSeconds.toFixed(1),
              sampleRate: info.sampleRate,
              recordedAt: recordingTime(rec).toISOString(),
              bitDepth: info.bitsPerSample,
              fileFormat: "WAV",
              fileSizeBytes: rec.file.size,
            },
            previewBlob,
            spectrogramBlob,
            accessUri: `${window.location.origin}/api/audiomoth/recordings?key=${encodeURIComponent(key)}`,
            deploymentRef: deploymentRef ?? undefined,
            tags: ["audiomoth", "passive-acoustic-monitoring"],
          });

          setRecording(rec.id, { status: "done" });
          setUploadedBytes((current) => current + rec.file.size);
        } catch (err) {
          if (err instanceof Error && err.message === "aborted") {
            setRecording(rec.id, { status: "queued", progress: 0 });
            return;
          }
          setRecording(rec.id, {
            status: "error",
            error: err instanceof Error && err.message ? err.message : t("uploadFailed"),
          });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (!cancelRef.current) setStage("done");
  }, [groups, makePreviews, manualEvent, matchFor, putToStorage, resolveAcDeployment, sessionDid, setRecording, t]);

  const cancelUpload = useCallback(() => {
    cancelRef.current = true;
    for (const xhr of activeXhrsRef.current) xhr.abort();
    activeXhrsRef.current.clear();
    setStage("review");
  }, []);

  const reset = useCallback(() => {
    setRecordings([]);
    setStage("pick");
    setManualEventUri("none");
    setGlobalError(null);
  }, []);

  /* ---------------- render ---------------- */

  if (!sessionDid) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <h2 className="text-base font-medium text-foreground">{t("signInTitle")}</h2>
        <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted-foreground">{t("signInBody")}</p>
      </div>
    );
  }

  const doneCount = recordings.filter((r) => r.status === "done").length;
  const errorCount = recordings.filter((r) => r.status === "error").length;
  const skippedCount = recordings.filter((r) => r.status === "skipped").length;
  const uploadableBytes = recordings
    .filter((r) => r.info && r.status !== "skipped")
    .reduce((sum, r) => sum + r.file.size, 0);
  const overallProgress = uploadableBytes > 0 ? Math.min(1, uploadedBytes / uploadableBytes) : 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">{t("intro")}</p>

      {/* Hidden inputs: folder-picker fallback + plain multi-file picker */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error non-standard folder attribute, supported by all target browsers
        webkitdirectory=""
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void scanFiles(files);
        }}
      />
      <input
        ref={filesInputRef}
        type="file"
        accept=".wav,audio/wav,audio/x-wav"
        className="hidden"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void scanFiles(files);
        }}
      />

      <AnimatePresence mode="wait">
        {stage === "pick" && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={pickFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") void pickFolder();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-primary bg-primary/[0.06]" : "border-border bg-card/60 hover:border-primary/50 hover:bg-primary/[0.03]",
              )}
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <HardDriveIcon className="size-7" />
              </span>
              <div>
                <p className="text-base font-medium text-foreground">{t("dropTitle")}</p>
                <p className="mx-auto mt-1 max-w-[460px] text-sm text-muted-foreground">{t("dropBody")}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void pickFolder();
                  }}
                >
                  <FolderOpenIcon className="size-4" />
                  {t("chooseFolder")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    filesInputRef.current?.click();
                  }}
                >
                  <AudioLinesIcon className="size-4" />
                  {t("chooseFiles")}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "scanning" && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card/60 px-6 py-14 text-center"
          >
            <Loader2Icon className="size-7 animate-spin text-primary" />
            <div>
              <p className="text-base font-medium text-foreground">{t("scanning")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("scanningCount", { done: scanProgress.done, total: scanProgress.total })}
              </p>
            </div>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${scanProgress.total ? (scanProgress.done / scanProgress.total) * 100 : 0}%` }}
              />
            </div>
          </motion.div>
        )}

        {(stage === "review" || stage === "uploading" || stage === "done") && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-4"
          >
            {stats.count === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
                <h3 className="text-base font-medium text-foreground">{t("noWavTitle")}</h3>
                <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted-foreground">{t("noWavBody")}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
                  {t("back")}
                </Button>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryTile label={t("summaryRecordings")} value={String(stats.count)} />
                  <SummaryTile label={t("summarySize")} value={formatBytes(stats.totalBytes)} />
                  <SummaryTile
                    label={t("summaryRange")}
                    value={
                      stats.first && stats.last
                        ? `${stats.first.toLocaleDateString()} – ${stats.last.toLocaleDateString()}`
                        : t("unknownTime")
                    }
                  />
                  <SummaryTile
                    label={t("summaryDevices")}
                    value={stats.devices.length > 0 ? stats.devices.join(", ") : "—"}
                    mono
                  />
                </div>

                {/* Deployment match per group */}
                <div className="flex flex-col gap-2">
                  {[...groups.entries()].map(([deploymentId, groupFiles]) => {
                    const event = deploymentId ? matchFor(deploymentId) : null;
                    return (
                      <div
                        key={deploymentId || "unassigned"}
                        className="flex flex-col gap-2 rounded-2xl border border-border bg-card/90 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full",
                              event ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600",
                            )}
                          >
                            {event ? <CheckIcon className="size-4.5" /> : <MapPinIcon className="size-4.5" />}
                          </span>
                          <div className="min-w-0">
                            {deploymentId ? (
                              event ? (
                                <>
                                  <p className="text-sm font-medium text-foreground">
                                    {t("matchedDeployment", { name: event.locality ?? event.eventID })}
                                  </p>
                                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{deploymentId}</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-medium text-foreground">{t("unmatchedTitle")}</p>
                                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{deploymentId}</p>
                                </>
                              )
                            ) : (
                              <p className="text-sm font-medium text-foreground">{t("noIdTitle")}</p>
                            )}
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t("groupCount", { count: groupFiles.length })}
                            </p>
                          </div>
                        </div>

                        {!deploymentId && (events?.length ?? 0) > 0 && (
                          <div className="flex flex-col gap-1.5 sm:w-64">
                            <Label className="text-xs text-muted-foreground">{t("assignLabel")}</Label>
                            <Select value={manualEventUri} onValueChange={setManualEventUri} disabled={stage !== "review"}>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t("assignNone")}</SelectItem>
                                {(events ?? []).map((e) => (
                                  <SelectItem key={e.uri} value={e.uri}>
                                    {e.locality ?? e.eventID}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unreadableCount > 0 && (
                    <p className="px-1 text-xs text-muted-foreground">{t("unreadable", { count: unreadableCount })}</p>
                  )}
                </div>

                {/* File list */}
                <div className="overflow-hidden rounded-2xl border border-border">
                  {recordings
                    .filter((r) => r.info)
                    .slice(0, LIST_RENDER_CAP)
                    .map((rec) => (
                      <FileRow key={rec.id} rec={rec} t={t} />
                    ))}
                  {stats.count > LIST_RENDER_CAP && (
                    <p className="border-t border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                      {t("moreFiles", { count: stats.count - LIST_RENDER_CAP })}
                    </p>
                  )}
                </div>

                {globalError ? (
                  <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{globalError}</p>
                ) : null}

                {/* Footer actions */}
                {stage === "review" && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/90 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Checkbox checked={makePreviews} onCheckedChange={(v) => setMakePreviews(v === true)} />
                      <span className="text-sm text-foreground">
                        {t("previewToggle")}
                        <span className="block text-xs text-muted-foreground">{t("previewHint")}</span>
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" onClick={reset}>
                        {t("back")}
                      </Button>
                      <Button size="sm" onClick={() => void startUpload()}>
                        <UploadIcon className="size-4" />
                        {t("uploadButton", { count: stats.count })}
                      </Button>
                    </div>
                  </div>
                )}

                {stage === "uploading" && (
                  <div className="sticky bottom-3 flex items-center gap-4 rounded-2xl border border-border bg-background/95 px-4 py-3.5 shadow-lg backdrop-blur-xl">
                    <Loader2Icon className="size-4.5 shrink-0 animate-spin text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          {t("uploadingButton", { done: doneCount, total: stats.count - skippedCount })}
                        </p>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {formatBytes(uploadedBytes)} / {formatBytes(uploadableBytes)}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${overallProgress * 100}%` }}
                        />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={cancelUpload}>
                      {t("cancel")}
                    </Button>
                  </div>
                )}

                {stage === "done" && (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/90 px-5 py-8 text-center">
                    <span
                      className={cn(
                        "grid h-12 w-12 place-items-center rounded-full",
                        errorCount === 0 ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600",
                      )}
                    >
                      {errorCount === 0 ? <CheckIcon className="size-6" /> : <CircleAlertIcon className="size-6" />}
                    </span>
                    <div>
                      <p className="text-base font-medium text-foreground">
                        {errorCount === 0 ? t("doneTitle") : t("doneWithErrors", { count: errorCount })}
                      </p>
                      <p className="mx-auto mt-1 max-w-[420px] text-sm text-muted-foreground">
                        {t("doneBody", { count: doneCount, skipped: skippedCount })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={reset}>
                        {t("uploadMore")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function SummaryTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/90 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-medium text-foreground", mono && "font-mono text-xs leading-5")}>
        {value}
      </p>
    </div>
  );
}

function FileRow({
  rec,
  t,
}: {
  rec: ScannedRecording;
  t: ReturnType<typeof useTranslations<"common.audiomoth.upload">>;
}) {
  const info = rec.info!;
  const time = rec.info?.recordedAt ? rec.info.recordedAt.toLocaleString() : null;

  return (
    <div className="relative flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
      {/* per-file progress wash */}
      {rec.status === "uploading" && (
        <div
          className="absolute inset-y-0 left-0 bg-primary/[0.07] transition-[width]"
          style={{ width: `${rec.progress * 100}%` }}
        />
      )}
      <span className="relative shrink-0 text-muted-foreground">
        <StatusIcon status={rec.status} />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-foreground">{rec.file.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[time, formatDuration(info.durationSeconds), `${(info.sampleRate / 1000).toFixed(0)} kHz`, formatBytes(rec.file.size)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {rec.status === "error" && rec.error ? (
          <p className="mt-0.5 truncate text-xs text-destructive">{rec.error}</p>
        ) : null}
      </div>
      <span className="relative shrink-0 text-xs text-muted-foreground">
        {rec.status === "skipped" && t("statusSkipped")}
        {rec.status === "saving" && t("statusSaving")}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case "done":
      return <CheckIcon className="size-4 text-primary" />;
    case "error":
      return <XIcon className="size-4 text-destructive" />;
    case "skipped":
      return <SkipForwardIcon className="size-4" />;
    case "uploading":
    case "saving":
      return <Loader2Icon className="size-4 animate-spin text-primary" />;
    default:
      return <AudioLinesIcon className="size-4 opacity-50" />;
  }
}
