"use client";

/**
 * The AudioMoth page's Upload tab — SD-card ingest inspired by the Arbimon
 * uploader. Pick the card (or any folder of recordings); every WAV header is
 * parsed client-side and the acoustic-chime deployment ID embedded by the
 * firmware is matched against the user's `dwc.event` deployments, so the
 * card is recognised the moment it is read.
 *
 * This tab reads the card, matches deployments and checks what the account
 * already holds; the transfer itself belongs to the app-wide background
 * upload tray, which keeps going while people browse. Per file the tray
 * runs the same pipeline this tab used to run inline (never through the
 * Next.js server):
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  readAudioMothInfo,
  type AudioMothRecordingInfo,
} from "@/app/_lib/audiomoth/wav-metadata";
import {
  activeUploadFolderMode,
  findUploadFolderByName,
  isUploadFolderChosen,
  planNamedUploadFolder,
  type UploadFolderMode,
} from "@/app/_lib/audiomoth/upload-folder";
import { UploadFolderPicker } from "./UploadFolderPicker";
import { AUDIO_UPLOAD_MAX_ATTEMPTS } from "@/app/_lib/audiomoth/upload-retry";
import {
  listDeploymentEvents,
  type DeploymentEventItem,
} from "@/app/_lib/deployment-events";
import {
  listAcDeployments,
  type AcDeploymentItem,
} from "@/app/_lib/ac-deployment";
import {
  legacyRecordingKey,
  listUploadedRecordingKeys,
  type UploadedRecordingKeys,
} from "@/app/_lib/ac-audio";
import { computeFileCid } from "@/app/_lib/audiomoth/content-cid";
import { FILE_READ_TIMEOUT_MS, withReadTimeout } from "@/app/_lib/audiomoth/stall-timeout";
import { collectDroppedFiles, isHiddenName } from "@/app/_lib/audiomoth/dropped-files";
import {
  useUploadTray,
  type UploadTarget,
  type UploadTrayJob,
} from "@/app/_components/upload-tray/upload-tray-context";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Stage = "pick" | "scanning" | "review";

type FileStatus = "queued" | "skipped" | "uploading" | "retrying" | "saving" | "done" | "error";

interface ScannedRecording {
  id: string;
  file: File;
  info: AudioMothRecordingInfo | null;
  /** Content CID, once computed by the already-uploaded check. */
  cid?: string | null;
  status: FileStatus;
  /** 0–1 for the storage PUT. */
  progress: number;
  retryAttempt?: number;
  retryMax?: number;
  error?: string;
}

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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function UploadTab({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.audiomoth.upload");
  const tray = useUploadTray();

  const [stage, setStage] = useState<Stage>("pick");
  const [recordings, setRecordings] = useState<ScannedRecording[]>([]);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  /** Files discovered so far while still walking the card (null = parsing). */
  const [discovered, setDiscovered] = useState<number | null>(null);
  const [events, setEvents] = useState<DeploymentEventItem[] | null>(null);
  const [manualEventUri, setManualEventUri] = useState<string>("none");
  const [makePreviews, setMakePreviews] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** User-editable group name for recordings without a matched deployment. */
  const [uploadName, setUploadName] = useState("");
  /** Folders (ac.deployments) already in the account, for "add to existing". */
  const [folders, setFolders] = useState<AcDeploymentItem[] | null>(null);
  /** Recordings already in each folder, filled by the already-uploaded check. */
  const [folderCounts, setFolderCounts] = useState<Map<string, number>>(new Map());
  /** Add to a folder you already have, or start a new one. */
  const [folderMode, setFolderMode] = useState<UploadFolderMode>("existing");
  const [selectedFolderUri, setSelectedFolderUri] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  /** True when the folder below was picked for the user, not by them. */
  const [folderResumed, setFolderResumed] = useState(false);
  /** Pre-upload check: which of the scanned files are already in the account. */
  const [dedup, setDedup] = useState<{ state: "checking" | "done"; skipped: number } | null>(null);
  /** Tray path only: how many recordings the last confirm handed over. */
  const [handedOff, setHandedOff] = useState(0);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  /** Bumped on every new scan/reset so stale dedup checks stop writing state. */
  const scanTokenRef = useRef(0);
  /** Keeps tray IDs unique when the same card is read twice in one session. */
  const batchRef = useRef(0);
  const acDeploymentsRef = useRef<AcDeploymentItem[] | null>(null);
  /** Scan whose folder was already matched by name, so it happens once. */
  const folderMatchTokenRef = useRef(-1);

  /* ---------------- deployments for matching ---------------- */

  useEffect(() => {
    if (!sessionDid) return;
    const ctrl = new AbortController();
    listDeploymentEvents(sessionDid, ctrl.signal)
      .then((list) => setEvents(list))
      .catch(() => setEvents([]));
    return () => ctrl.abort();
  }, [sessionDid]);

  /* ---------------- folders to upload into ---------------- */

  /**
   * The folders the account already has — every `ac.deployment`, which is
   * what groups recordings on the profile. Reloaded after an upload creates
   * one, so a second card can be added to the folder just made.
   */
  const loadFolders = useCallback(
    async (signal?: AbortSignal) => {
      if (!sessionDid) return;
      try {
        const list = await listAcDeployments(sessionDid, signal);
        if (signal?.aborted) return;
        acDeploymentsRef.current = list;
        setFolders(list);
      } catch {
        if (!signal?.aborted) setFolders([]);
      }
    },
    [sessionDid],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadFolders(ctrl.signal);
    return () => ctrl.abort();
  }, [loadFolders]);

  /**
   * Resuming an interrupted upload: the same card is read again, so its name
   * already belongs to a folder in the account. That folder is selected for
   * the user instead of offering to start a second one with the same name —
   * the rest of the card joins the recordings that made it the first time.
   */
  useEffect(() => {
    const token = scanTokenRef.current;
    if (folderMatchTokenRef.current === token) return; // matched, or the user has chosen
    if (!folders || !uploadName.trim()) return;
    folderMatchTokenRef.current = token;
    const match = findUploadFolderByName(folders, uploadName);
    if (!match) return;
    setFolderMode("existing");
    setSelectedFolderUri(match.uri);
    setFolderResumed(true);
  }, [folders, uploadName]);

  /**
   * The moment the user touches the folder controls the choice is theirs —
   * a folder list that finishes loading late must not move it under them.
   */
  const noteFolderChoice = useCallback(() => {
    folderMatchTokenRef.current = scanTokenRef.current;
    setFolderResumed(false);
  }, []);

  /* ---------------- scanning ---------------- */

  const setRecording = useCallback((id: string, patch: Partial<ScannedRecording>) => {
    setRecordings((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /**
   * After scanning, hash each file and compare it against the recordings
   * already in the account — by content CID, with a name+size fallback for
   * records created before CIDs were stored. Matches are marked skipped
   * before anything is uploaded.
   */
  const checkAlreadyUploaded = useCallback(
    async (scanned: ScannedRecording[], token: number) => {
      if (!sessionDid) return;
      const readable = scanned.filter((r) => r.info);
      if (readable.length === 0) return;
      setDedup({ state: "checking", skipped: 0 });

      let keys: UploadedRecordingKeys;
      try {
        keys = await listUploadedRecordingKeys(sessionDid);
      } catch {
        // The account couldn't be checked — proceed as a normal upload.
        if (scanTokenRef.current === token) setDedup(null);
        return;
      }
      if (scanTokenRef.current !== token) return;
      setFolderCounts(keys.countsByDeployment);

      let skipped = 0;
      const BATCH = 4;
      for (let i = 0; i < readable.length; i += BATCH) {
        const batch = readable.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (rec) => {
            // A card that stops responding must not freeze the check.
            const cid = await withReadTimeout(computeFileCid(rec.file), FILE_READ_TIMEOUT_MS, null);
            if (scanTokenRef.current !== token) return;
            const already =
              (cid !== null && keys.cids.has(cid)) ||
              keys.legacy.has(legacyRecordingKey(rec.file.name, rec.file.size));
            if (already) skipped += 1;
            setRecording(rec.id, already ? { cid, status: "skipped" } : { cid });
          }),
        );
        if (scanTokenRef.current !== token) return;
        setDedup({ state: "checking", skipped });
      }
      setDedup({ state: "done", skipped });
    },
    [sessionDid, setRecording],
  );

  const scanFiles = useCallback(async (files: File[], folderName = "") => {
    const token = ++scanTokenRef.current;
    const wavs = files.filter((f) => isWavName(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    setDiscovered(null);
    setGlobalError(null);
    setRecordings([]);
    setUploadName(folderName.trim());
    setSelectedFolderUri("");
    setFolderQuery("");
    setFolderResumed(false);
    setDedup(null);
    setHandedOff(0);
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
      // One unreadable file (a sleeping card, a bad sector) used to leave the
      // whole scan sitting at a fixed count forever; it is skipped instead and
      // surfaced afterwards in the unreadable count.
      const infos = await Promise.all(
        batch.map((file) => withReadTimeout(readAudioMothInfo(file), FILE_READ_TIMEOUT_MS, null)),
      );
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
    void checkAlreadyUploaded(scanned, token);
  }, [checkAlreadyUploaded]);

  const pickFolder = useCallback(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }
    let dir: unknown;
    try {
      dir = await picker.call(window);
    } catch {
      return; // user dismissed the picker
    }
    // Immediate feedback — big cards take a while to enumerate.
    setGlobalError(null);
    setStage("scanning");
    setDiscovered(0);
    try {
      const files: File[] = [];
      const walk = async (handle: unknown): Promise<void> => {
        const h = handle as {
          kind: string;
          name?: string;
          values?: () => AsyncIterable<unknown>;
          getFile?: () => Promise<File>;
        };
        if (isHiddenName(h.name)) return;
        if (h.kind === "file" && h.getFile) {
          try {
            files.push(await h.getFile());
          } catch {
            return; // unreadable entry — skip
          }
          if (files.length % 50 === 0) setDiscovered(files.length);
        } else if (h.kind === "directory" && h.values) {
          try {
            for await (const child of h.values()) await walk(child);
          } catch {
            /* system folders on SD cards can refuse iteration — skip them */
          }
        }
      };
      await walk(dir);
      setDiscovered(files.length);
      await scanFiles(files, (dir as { name?: string })?.name ?? "");
    } catch (err) {
      console.error("[audiomoth-upload] reading the folder failed", err);
      setGlobalError(t("readFailed"));
      setDiscovered(null);
      setStage("pick");
    }
  }, [scanFiles, t]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const items = event.dataTransfer.items;
      const plainFiles = Array.from(event.dataTransfer.files);
      // Folder name must be read synchronously, before the drop event settles.
      let folderName = "";
      for (let i = 0; i < (items?.length ?? 0); i += 1) {
        const entry = (items[i] as unknown as { webkitGetAsEntry?: () => { isDirectory?: boolean; name?: string } | null }).webkitGetAsEntry?.();
        if (entry?.isDirectory && entry.name && !isHiddenName(entry.name)) {
          folderName = entry.name;
          break;
        }
      }
      setGlobalError(null);
      setStage("scanning");
      setDiscovered(0);
      try {
        const dropped = items?.length ? await collectDroppedFiles(items, setDiscovered) : plainFiles;
        if (dropped.length > 0) {
          await scanFiles(dropped, folderName);
        } else {
          setDiscovered(null);
          setStage("pick");
        }
      } catch (err) {
        console.error("[audiomoth-upload] reading the dropped folder failed", err);
        setGlobalError(t("readFailed"));
        setDiscovered(null);
        setStage("pick");
      }
    },
    [scanFiles, t],
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

  /**
   * True when at least one group of recordings would otherwise land in
   * "Other recordings": no chime match and no manually linked deployment.
   * Those files get grouped under a new named deployment instead.
   */
  const needsName = useMemo(
    () => [...groups.keys()].some((deploymentId) => (deploymentId ? !matchFor(deploymentId) : !manualEvent)),
    [groups, manualEvent, matchFor],
  );

  /* ---------------- folder choice ---------------- */

  /** With no folders yet there is nothing to choose from — name a new one. */
  const activeFolderMode = activeUploadFolderMode(folderMode, folders?.length ?? 0);

  /** Everything the batch needs before it can start. */
  const folderChosen = isUploadFolderChosen({
    needsFolder: needsName,
    mode: activeFolderMode,
    selectedFolderUri,
    newFolderName: uploadName,
  });

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

  /**
   * Tray path: build one job per recording, hand the batch over and drop back
   * to the picker — the transfer carries on in the tray while the user works.
   * Returns false when there was nothing to hand over.
   */
  const handOffToTray = useCallback((): boolean => {
    if (!sessionDid) return false;

    const batch = ++batchRef.current;
    const jobs: UploadTrayJob[] = [];

    for (const [deploymentId, groupFiles] of groups) {
      const event = deploymentId ? matchFor(deploymentId) : manualEvent;
      const pending = groupFiles.filter(
        (rec) => rec.info && (rec.status === "queued" || rec.status === "error"),
      );
      if (pending.length === 0) continue;

      // Recordings with no matched deployment are grouped under the name the
      // user gave this upload, so they stay findable on their profile.
      let target: UploadTarget = { kind: "none" };
      if (event) {
        target = { kind: "event", event };
      } else if (activeFolderMode === "existing" && selectedFolderUri) {
        target = { kind: "existing", uri: selectedFolderUri };
      } else if (activeFolderMode === "new" && uploadName.trim()) {
        // The tray resolves a named target to an existing folder of that name
        // before creating one, so a resumed card never forks a new folder.
        const earliest = new Date(Math.min(...pending.map((rec) => recordingTime(rec).getTime())));
        target = { kind: "named", name: uploadName.trim(), deployedAt: earliest.toISOString() };
      }

      for (const rec of pending) {
        jobs.push({
          id: `${batch}:${rec.id}`,
          file: rec.file,
          info: rec.info!,
          recordedAt: recordingTime(rec).toISOString(),
          cid: rec.cid,
          deploymentId: deploymentId || undefined,
          target,
          makePreviews,
        });
      }
    }

    if (jobs.length === 0) return false;
    tray.enqueue(sessionDid, jobs);

    scanTokenRef.current += 1;
    setRecordings([]);
    setStage("pick");
    setManualEventUri("none");
    setGlobalError(null);
    setUploadName("");
    setSelectedFolderUri("");
    setFolderQuery("");
    setFolderResumed(false);
    setDedup(null);
    setHandedOff(jobs.length);
    void loadFolders();
    return true;
  }, [
    activeFolderMode,
    groups,
    loadFolders,
    makePreviews,
    manualEvent,
    matchFor,
    selectedFolderUri,
    sessionDid,
    tray,
    uploadName,
  ]);

  /** Hand the batch to the background tray. */
  const startUpload = useCallback(() => {
    if (!sessionDid) return;
    handOffToTray();
  }, [handOffToTray, sessionDid]);

  const reset = useCallback(() => {
    scanTokenRef.current += 1;
    setRecordings([]);
    setStage("pick");
    setManualEventUri("none");
    setGlobalError(null);
    setUploadName("");
    setSelectedFolderUri("");
    setFolderQuery("");
    setFolderResumed(false);
    setDedup(null);
    setHandedOff(0);
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

  const skippedCount = recordings.filter((r) => r.status === "skipped").length;
  const uploadableCount = stats.count - skippedCount;

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
          const relative = (files[0] as { webkitRelativePath?: string } | undefined)?.webkitRelativePath;
          if (files.length) void scanFiles(files, relative?.split("/")[0] ?? "");
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

      {/* Tray path: the batch is the tray's job now — this is the receipt. */}
      {stage === "pick" && handedOff > 0 ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            {t("handedOffTitle", { count: handedOff })}{" "}
            <span className="text-muted-foreground">{t("handedOffBody")}</span>
          </p>
        </div>
      ) : null}

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
            {globalError ? (
              <p className="mt-3 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{globalError}</p>
            ) : null}
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
                {discovered !== null
                  ? t("discovering", { count: discovered })
                  : t("scanningCount", { done: scanProgress.done, total: scanProgress.total })}
              </p>
            </div>
            {discovered === null ? (
              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${scanProgress.total ? (scanProgress.done / scanProgress.total) * 100 : 0}%` }}
                />
              </div>
            ) : null}
          </motion.div>
        )}

        {stage === "review" && (
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
                {globalError ? <p className="mx-auto mt-2 max-w-[420px] text-sm text-destructive">{globalError}</p> : null}
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

                {/* Already-uploaded check */}
                {dedup && (dedup.state === "checking" || dedup.skipped > 0) && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
                    {dedup.state === "checking" ? (
                      <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <SkipForwardIcon className="size-4 shrink-0" />
                    )}
                    <span>
                      {dedup.state === "checking" ? t("dedupChecking") : t("dedupSkipped", { count: dedup.skipped })}
                    </span>
                  </div>
                )}

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

                {/* Folder prompt — recordings that would otherwise be scattered
                    under "Other recordings" join a folder the account already
                    has, or start a new one. */}
                {stage === "review" && needsName && (
                  <UploadFolderPicker
                    folders={folders}
                    counts={folderCounts}
                    mode={folderMode}
                    onModeChange={(mode) => {
                      noteFolderChoice();
                      setFolderMode(mode);
                    }}
                    selectedUri={selectedFolderUri}
                    onSelect={(uri) => {
                      noteFolderChoice();
                      setSelectedFolderUri(uri);
                    }}
                    query={folderQuery}
                    onQueryChange={setFolderQuery}
                    newName={uploadName}
                    onNewNameChange={(name) => {
                      noteFolderChoice();
                      setUploadName(name);
                    }}
                    resumed={folderResumed}
                  />
                )}

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
                      <Button
                        size="sm"
                        disabled={!folderChosen || dedup?.state === "checking" || uploadableCount === 0}
                        title={
                          !folderChosen
                            ? activeFolderMode === "existing"
                              ? t("folderRequired")
                              : t("groupNameRequired")
                            : undefined
                        }
                        onClick={() => void startUpload()}
                      >
                        <UploadIcon className="size-4" />
                        {uploadableCount === 0 && dedup?.state === "done"
                          ? t("allUploaded")
                          : t("uploadButton", { count: uploadableCount })}
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
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0",
        rec.status === "skipped" && "opacity-60",
      )}
    >
      <span className="shrink-0 text-muted-foreground">
        <StatusIcon status={rec.status} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-foreground">{rec.file.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[time, formatDuration(info.durationSeconds), `${(info.sampleRate / 1000).toFixed(0)} kHz`, formatBytes(rec.file.size)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(rec.status === "uploading" || rec.status === "retrying") && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round(rec.progress * 100)}%` }}
            />
          </div>
        )}
        {rec.status === "error" && rec.error ? (
          <p className="mt-0.5 truncate text-xs text-destructive">{rec.error}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {rec.status === "uploading" && `${Math.round(rec.progress * 100)}%`}
        {rec.status === "skipped" && t("statusSkipped")}
        {rec.status === "retrying" &&
          t("statusRetrying", {
            attempt: rec.retryAttempt ?? 2,
            max: rec.retryMax ?? AUDIO_UPLOAD_MAX_ATTEMPTS,
          })}
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
    case "retrying":
      return <Loader2Icon className="size-4 animate-spin text-primary" />;
    case "saving":
      /* Transfer finished — static icon; only the "Saving…" label remains. */
      return <CheckIcon className="size-4 text-muted-foreground" />;
    default:
      return <AudioLinesIcon className="size-4 opacity-50" />;
  }
}
