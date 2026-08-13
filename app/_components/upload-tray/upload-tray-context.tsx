"use client";

/**
 * Background upload tray — the app-wide engine behind recording uploads.
 *
 * The AudioMoth page used to own the whole upload: you picked a card, waited
 * on a full-page progress screen and could not go anywhere until it finished.
 * The queue now lives here instead, mounted above the router in the root
 * layout, so uploads keep running while people browse, tag species or start
 * another batch. The visible part is `UploadTray`.
 *
 * Per file the pipeline is unchanged (it never goes through our server):
 *   1. presign a PUT and send the full WAV browser → object storage
 *   2. encode a compact 8 kHz preview + spectrogram locally → PDS blobs
 *   3. write the `ac.audio` record linking preview + archival copy to its
 *      `ac.deployment` (created on the fly the first time it is needed)
 *
 * Every file is independently pausable, cancellable and retryable, so one bad
 * transfer never holds up the rest of the card.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  encodeWav,
  extractPreviewSamples,
  PREVIEW_SAMPLE_RATE,
  type AudioMothRecordingInfo,
} from "@/app/_lib/audiomoth/wav-metadata";
import { renderSpectrogramPng } from "@/app/_lib/audiomoth/spectrogram";
import {
  AUDIO_UPLOAD_MAX_ATTEMPTS,
  isNetworkFetchError,
  isRetryableStorageError,
  isUploadAbortError,
  storageStatusFromError,
  withUploadRetries,
} from "@/app/_lib/audiomoth/upload-retry";
import type { DeploymentEventItem } from "@/app/_lib/deployment-events";
import {
  createAcDeployment,
  listAcDeployments,
  type AcDeploymentItem,
} from "@/app/_lib/ac-deployment";
import {
  createAcAudioRecord,
  listUploadedRecordingNames,
  updateRecordingDeployment,
  uploadPreviewBlob,
} from "@/app/_lib/ac-audio";
import { computeFileCid } from "@/app/_lib/audiomoth/content-cid";
import { createStallTimer, UPLOAD_STALL_TIMEOUT_MS } from "@/app/_lib/audiomoth/stall-timeout";
import { planNamedUploadFolder } from "@/app/_lib/audiomoth/upload-folder";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type UploadTrayStatus =
  | "queued"
  | "uploading"
  | "retrying"
  | "saving"
  | "paused"
  | "done"
  | "error";

/** One row in the tray. */
export interface UploadTrayItem {
  id: string;
  name: string;
  sizeBytes: number;
  status: UploadTrayStatus;
  /** 0–1, the storage transfer only. */
  progress: number;
  /** Groups rows enqueued together, for batch-level surfaces (attach flow). */
  batchKey?: string;
  error?: string;
  retryAttempt?: number;
  retryMax?: number;
}

/** Where a file's `ac.audio` record should be filed. */
export type UploadTarget =
  | { kind: "event"; event: DeploymentEventItem }
  /** A folder (`ac.deployment`) the account already has. */
  | { kind: "existing"; uri: string }
  | { kind: "named"; name: string; deployedAt: string }
  | { kind: "none" };

/** Everything the engine needs to upload one recording. */
export interface UploadTrayJob {
  id: string;
  file: File;
  info: AudioMothRecordingInfo;
  /** ISO timestamp the recording was made. */
  recordedAt: string;
  /** Content CID, when the caller already hashed the file for its dedup check. */
  cid?: string | null;
  /** Acoustic-chime deployment ID, which namespaces the storage key. */
  deploymentId?: string;
  /**
   * Repo the `ac.audio` record, its preview blobs and any created
   * `ac.deployment` land in — an organization's DID when uploading for an
   * org, otherwise absent (the signed-in user's own repo).
   */
  repoDid?: string | null;
  /**
   * Opaque batch handle. Jobs sharing one can be retargeted together later
   * via {@link UploadTrayApi.retargetBatch} — the "set one up ↗" flow keeps
   * the bytes moving while the deployment is created elsewhere.
   */
  batchKey?: string;
  target: UploadTarget;
  makePreviews: boolean;
}

export interface UploadTrayApi {
  /**
   * The AUDIOMOTH_UPLOAD_TRAY_ENABLED release switch, as seen by the root
   * layout. Surfaces that would enqueue background uploads from outside the
   * AudioMoth page (the quick "Add observations" modal's audio branch) stay
   * photo-only while this is off, because a hidden tray would mean invisible
   * transfers.
   */
  uiEnabled: boolean;
  items: UploadTrayItem[];
  /** Something is still queued, transferring or paused. */
  busy: boolean;
  enqueue: (sessionDid: string, jobs: UploadTrayJob[]) => void;
  pauseItem: (id: string) => void;
  resumeItem: (id: string) => void;
  retryItem: (id: string) => void;
  cancelItem: (id: string) => void;
  cancelAll: () => void;
  /** Clear a finished tray (all done / nothing left to do). */
  dismiss: () => void;
  /**
   * Point every job of a batch — queued, running and already saved — at a
   * different deployment. Records written before the call are re-pointed
   * one by one; everything still in flight saves against the new target.
   * Returns how many already-saved records were moved / could not be moved.
   */
  retargetBatch: (batchKey: string, target: UploadTarget) => Promise<{ moved: number; failed: number }>;
  /** Live counts + repo for a batch, or null when the tray doesn't know it. */
  batchInfo: (batchKey: string) => { repoDid: string | null; pending: number; total: number } | null;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const CONCURRENCY = 2;

const UploadTrayContext = createContext<UploadTrayApi | null>(null);

/** Only the statuses that occupy an upload slot. */
function isRunning(status: UploadTrayStatus | undefined): boolean {
  return status === "uploading" || status === "retrying" || status === "saving";
}

type InternalJob = UploadTrayJob & { sessionDid: string };

export function UploadTrayProvider({
  children,
  uiEnabled = false,
}: {
  children: React.ReactNode;
  /** Whether the visible tray panel is rendered — see {@link UploadTrayApi.uiEnabled}. */
  uiEnabled?: boolean;
}) {
  const t = useTranslations("common.audiomoth.upload");

  const [items, setItems] = useState<UploadTrayItem[]>([]);
  const [expanded, setExpanded] = useState(true);

  /** Files + upload instructions, kept out of state (they never render). */
  const jobsRef = useRef(new Map<string, InternalJob>());
  /** Queue order, so files upload in the order they were picked. */
  const orderRef = useRef<string[]>([]);
  /**
   * Statuses mirrored synchronously: the scheduler runs outside React's
   * render cycle and must never start a file twice off a stale snapshot.
   */
  const statusRef = useRef(new Map<string, UploadTrayStatus>());
  const xhrRef = useRef(new Map<string, XMLHttpRequest>());
  const abortRef = useRef(new Map<string, AbortController>());
  /** ac.deployment URI per owner+target key — created once, reused by every file. */
  const deploymentRef = useRef(new Map<string, Promise<string | null>>());
  /** Recording names already in each deployment, so a re-read card is skipped. */
  const existingNamesRef = useRef(new Map<string, Promise<Set<string>>>());
  /** Folder lists per owner repo (an org uploads into its own folder set). */
  const acDeploymentsRef = useRef(new Map<string, AcDeploymentItem[]>());
  /** Session + repo per batch, so a retarget can resolve without a live job. */
  const batchMetaRef = useRef(new Map<string, { sessionDid: string; repoDid: string | null }>());
  /** Saved records per batch (rkey + the deployment they were filed under). */
  const completedByBatchRef = useRef(new Map<string, Array<{ rkey: string; deploymentUri: string | null }>>());
  /** Replacement target per batch — wins over each job's original target. */
  const retargetRef = useRef(new Map<string, UploadTarget>());

  const patchItem = useCallback((id: string, patch: Partial<UploadTrayItem>) => {
    if (patch.status) statusRef.current.set(id, patch.status);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  /* ---------------- deployment resolution ---------------- */

  /** The repo a job's records live in (the org's when uploading for one). */
  const jobOwnerDid = useCallback(
    (scope: { sessionDid: string; repoDid?: string | null }): string =>
      scope.repoDid?.trim() || scope.sessionDid,
    [],
  );

  /** Proxy write option — only group repos are passed through. */
  const jobRepoOption = useCallback(
    (scope: { sessionDid: string; repoDid?: string | null }): { repo?: string } => {
      const repo = scope.repoDid?.trim();
      return repo && repo !== scope.sessionDid ? { repo } : {};
    },
    [],
  );

  const targetKey = useCallback((target: UploadTarget, ownerDid: string): string => {
    if (target.kind === "event") return `${ownerDid}|event:${target.event.uri}`;
    if (target.kind === "existing") return `${ownerDid}|existing:${target.uri}`;
    if (target.kind === "named") return `${ownerDid}|named:${target.name}`;
    return `${ownerDid}|none`;
  }, []);

  /** A batch retarget replaces every job's original filing target. */
  const effectiveTarget = useCallback((job: InternalJob): UploadTarget => {
    if (job.batchKey) {
      const replacement = retargetRef.current.get(job.batchKey);
      if (replacement) return replacement;
    }
    return job.target;
  }, []);

  /**
   * The `ac.deployment` a target resolves to. Resolution is memoised as a
   * promise so the two upload workers racing on the first file of a batch
   * cannot create the same deployment twice.
   */
  const resolveTarget = useCallback(
    (
      target: UploadTarget,
      scope: { sessionDid: string; repoDid?: string | null },
    ): Promise<string | null> => {
      const ownerDid = jobOwnerDid(scope);
      const key = targetKey(target, ownerDid);
      const cached = deploymentRef.current.get(key);
      if (cached) return cached;

      const loadFolders = async (): Promise<AcDeploymentItem[]> => {
        const cachedFolders = acDeploymentsRef.current.get(ownerDid);
        if (cachedFolders) return cachedFolders;
        const loaded = await listAcDeployments(ownerDid).catch(() => []);
        acDeploymentsRef.current.set(ownerDid, loaded);
        return loaded;
      };

      const repoOption = jobRepoOption(scope);

      const pending = (async (): Promise<string | null> => {
        if (target.kind === "none") return null;
        if (target.kind === "existing") return target.uri;
        if (target.kind === "named") {
          // An upload resumed by re-reading the same card offers the same
          // folder name — those recordings belong in the folder that already
          // exists, not in a second one beside it.
          const plan = planNamedUploadFolder(await loadFolders(), target.name);
          if (plan.action === "none") return null;
          if (plan.action === "reuse") return plan.uri;
          try {
            const created = await createAcDeployment(
              {
                name: plan.name,
                deployedAt: new Date(target.deployedAt),
                remarks: t("groupRemarks"),
              },
              repoOption,
            );
            acDeploymentsRef.current.delete(ownerDid);
            return created.uri;
          } catch {
            return null;
          }
        }

        const event = target.event;
        const existing = (await loadFolders()).find((d) => d.eventRef === event.uri);
        if (existing) return existing.uri;
        try {
          const created = await createAcDeployment(
            {
              name: event.locality ?? `AudioMoth ${event.eventID}`,
              deployedAt: new Date(event.eventDate),
              lat: event.decimalLatitude ? Number(event.decimalLatitude) : undefined,
              lon: event.decimalLongitude ? Number(event.decimalLongitude) : undefined,
              eventUri: event.uri,
              remarks: t("deploymentFallback"),
            },
            repoOption,
          );
          acDeploymentsRef.current.delete(ownerDid);
          return created.uri;
        } catch {
          return null;
        }
      })();

      deploymentRef.current.set(key, pending);
      return pending;
    },
    [jobOwnerDid, jobRepoOption, t, targetKey],
  );

  const resolveExistingNames = useCallback(
    (sessionDid: string, deploymentUri: string): Promise<Set<string>> => {
      const cached = existingNamesRef.current.get(deploymentUri);
      if (cached) return cached;
      const pending = listUploadedRecordingNames(sessionDid, deploymentUri).catch(
        () => new Set<string>(),
      );
      existingNamesRef.current.set(deploymentUri, pending);
      return pending;
    },
    [],
  );

  /* ---------------- one file ---------------- */

  const describeError = useCallback(
    (err: unknown, phase: "transfer" | "saving"): string => {
      if (phase === "saving") {
        return isNetworkFetchError(err) ? t("errorSaveConnection") : t("errorSaveFailed");
      }
      if (storageStatusFromError(err) !== null) return t("errorStorageRejected");
      if ((err instanceof Error && err.message === "storage_network") || isNetworkFetchError(err)) {
        return t("errorConnection");
      }
      return t("uploadFailed");
    },
    [t],
  );

  const putToStorage = useCallback(
    (id: string, file: File, url: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current.set(id, xhr);
        // A half-open connection leaves the request pending with no error and
        // no further progress, which would park the tray indefinitely.
        let stalled = false;
        const watchdog = createStallTimer(UPLOAD_STALL_TIMEOUT_MS, () => {
          stalled = true;
          xhr.abort();
        });
        xhr.open("PUT", url);
        xhr.upload.onprogress = (e) => {
          watchdog.bump();
          if (e.lengthComputable) patchItem(id, { progress: e.loaded / e.total });
        };
        const finish = () => {
          watchdog.stop();
          xhrRef.current.delete(id);
        };
        xhr.onload = () => {
          finish();
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`storage_${xhr.status}`));
        };
        xhr.onerror = () => {
          finish();
          reject(new Error("storage_network"));
        };
        xhr.onabort = () => {
          finish();
          // A watchdog abort is a failed transfer and should be retried; a
          // user cancel stays final.
          reject(new Error(stalled ? "storage_network" : "aborted"));
        };
        xhr.send(file);
      }),
    [patchItem],
  );

  const runJob = useCallback(
    async (id: string): Promise<void> => {
      const job = jobsRef.current.get(id);
      if (!job) return;
      const controller = new AbortController();
      abortRef.current.set(id, controller);
      let phase: "transfer" | "saving" = "transfer";

      try {
        const resolvedTarget = effectiveTarget(job);
        const deploymentUri = await resolveTarget(resolvedTarget, job);
        if (controller.signal.aborted) throw new Error("aborted");

        // A card re-read after a partial upload: anything already filed under
        // this deployment is left alone rather than uploaded twice.
        if (deploymentUri) {
          const existing = await resolveExistingNames(jobOwnerDid(job), deploymentUri);
          if (existing.has(job.file.name)) {
            patchItem(id, { status: "done", progress: 1, error: undefined });
            return;
          }
        }
        if (controller.signal.aborted) throw new Error("aborted");

        // Presigned PUT URLs expire, so one is minted per attempt rather than
        // per batch — a file paused for an hour still resumes cleanly.
        const res = await fetch("/api/audiomoth/recordings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deploymentId: job.deploymentId || undefined,
            files: [{ name: job.file.name, sizeBytes: job.file.size }],
          }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as {
          error?: string;
          uploads?: Array<{ name: string; key?: string; url?: string; error?: string }>;
        } | null;
        const upload = json?.uploads?.[0];
        if (!res.ok || !upload?.key || !upload.url) {
          throw new Error(json?.error === "not_configured" ? "not_configured" : "presign_failed");
        }

        await withUploadRetries(
          async (attempt) => {
            patchItem(id, {
              status: "uploading",
              progress: 0,
              retryAttempt: attempt,
              retryMax: AUDIO_UPLOAD_MAX_ATTEMPTS,
              error: undefined,
            });
            await putToStorage(id, job.file, upload.url!);
          },
          {
            shouldRetry: isRetryableStorageError,
            signal: controller.signal,
            onRetry: ({ nextAttempt, maxAttempts }) => {
              patchItem(id, { status: "retrying", progress: 0, retryAttempt: nextAttempt, retryMax: maxAttempts });
            },
          },
        );

        phase = "saving";
        patchItem(id, { status: "saving", progress: 1, retryAttempt: undefined, retryMax: undefined });

        const repoOption = jobRepoOption(job);
        let previewBlob = null;
        let spectrogramBlob = null;
        if (job.makePreviews) {
          try {
            const samples = await extractPreviewSamples(job.file, job.info);
            if (samples) {
              previewBlob = await uploadPreviewBlob(encodeWav(samples, PREVIEW_SAMPLE_RATE), "audio/wav", repoOption);
              const png = await renderSpectrogramPng(samples);
              if (png) spectrogramBlob = await uploadPreviewBlob(png, "image/png", repoOption);
            }
          } catch {
            /* preview + spectrogram are best-effort — the archival copy is already safe */
          }
        }

        // A retarget can land while the bytes were transferring — re-resolve
        // just before the record is written so the batch attaches to the
        // deployment created mid-flight instead of the original fallback.
        let recordDeploymentUri = deploymentUri;
        const latestTarget = effectiveTarget(job);
        if (targetKey(latestTarget, jobOwnerDid(job)) !== targetKey(resolvedTarget, jobOwnerDid(job))) {
          recordDeploymentUri = await resolveTarget(latestTarget, job);
        }

        const originalCid = job.cid ?? (await computeFileCid(job.file)) ?? undefined;
        const saved = await createAcAudioRecord(
          {
            name: job.file.name,
            originalCid,
            metadata: {
              codec: "PCM",
              channels: job.info.channels,
              duration: job.info.durationSeconds.toFixed(1),
              sampleRate: job.info.sampleRate,
              recordedAt: job.recordedAt,
              bitDepth: job.info.bitsPerSample,
              fileFormat: "WAV",
              fileSizeBytes: job.file.size,
            },
            previewBlob,
            spectrogramBlob,
            accessUri: `${window.location.origin}/api/audiomoth/recordings?key=${encodeURIComponent(upload.key)}`,
            deploymentRef: recordDeploymentUri ?? undefined,
            tags: ["audiomoth", "passive-acoustic-monitoring"],
          },
          repoOption,
        );

        // Remember what was written where, so a later retarget can re-point
        // this record even though it is already saved.
        if (job.batchKey) {
          const rkey = saved.uri.split("/").pop() ?? "";
          const done = completedByBatchRef.current.get(job.batchKey) ?? [];
          done.push({ rkey, deploymentUri: recordDeploymentUri });
          completedByBatchRef.current.set(job.batchKey, done);

          // Close the race the other way too: a retarget that landed between
          // the re-resolve above and the save re-points the fresh record now.
          const finalTarget = effectiveTarget(job);
          if (targetKey(finalTarget, jobOwnerDid(job)) !== targetKey(latestTarget, jobOwnerDid(job))) {
            const finalUri = await resolveTarget(finalTarget, job);
            if (finalUri && finalUri !== recordDeploymentUri) {
              await updateRecordingDeployment(rkey, finalUri, repoOption).catch(() => {});
              done[done.length - 1] = { rkey, deploymentUri: finalUri };
            }
          }
        }

        // Cancelling can't interrupt the record write, so a file cancelled
        // during the save is simply gone from the tray by now.
        if (!jobsRef.current.has(id)) return;
        patchItem(id, { status: "done", progress: 1, retryAttempt: undefined, retryMax: undefined, error: undefined });
      } catch (err) {
        // A pause or a cancel aborts the transfer; neither is a failure.
        const status = statusRef.current.get(id);
        if (isUploadAbortError(err) || status === "paused" || !jobsRef.current.has(id)) {
          if (status !== "paused" && jobsRef.current.has(id)) {
            patchItem(id, { status: "queued", progress: 0, retryAttempt: undefined, retryMax: undefined });
          }
          return;
        }
        patchItem(id, {
          status: "error",
          retryAttempt: undefined,
          retryMax: undefined,
          error:
            err instanceof Error && err.message === "not_configured"
              ? t("notConfigured")
              : describeError(err, phase),
        });
      } finally {
        abortRef.current.delete(id);
        xhrRef.current.delete(id);
      }
    },
    [describeError, effectiveTarget, jobOwnerDid, jobRepoOption, patchItem, putToStorage, resolveTarget, resolveExistingNames, t, targetKey],
  );

  /* ---------------- scheduler ---------------- */

  const pumpRef = useRef<() => void>(() => {});

  const pump = useCallback(() => {
    let running = 0;
    for (const status of statusRef.current.values()) if (isRunning(status)) running += 1;

    while (running < CONCURRENCY) {
      const next = orderRef.current.find((id) => statusRef.current.get(id) === "queued");
      if (!next) break;
      patchItem(next, { status: "uploading", progress: 0, error: undefined });
      running += 1;
      void runJob(next).finally(() => pumpRef.current());
    }
  }, [patchItem, runJob]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  /* ---------------- public actions ---------------- */

  const enqueue = useCallback(
    (sessionDid: string, jobs: UploadTrayJob[]) => {
      if (jobs.length === 0) return;
      const added: UploadTrayItem[] = [];
      for (const job of jobs) {
        if (jobsRef.current.has(job.id)) continue;
        jobsRef.current.set(job.id, { ...job, sessionDid });
        orderRef.current.push(job.id);
        statusRef.current.set(job.id, "queued");
        if (job.batchKey && !batchMetaRef.current.has(job.batchKey)) {
          batchMetaRef.current.set(job.batchKey, { sessionDid, repoDid: job.repoDid?.trim() || null });
        }
        added.push({
          id: job.id,
          name: job.file.name,
          sizeBytes: job.file.size,
          status: "queued",
          progress: 0,
          batchKey: job.batchKey,
        });
      }
      if (added.length === 0) return;
      // A new batch re-reads what each deployment already holds, so files
      // uploaded earlier in this session still count as "already there".
      existingNamesRef.current.clear();
      setItems((current) => [...current, ...added]);
      setExpanded(true);
      pump();
    },
    [pump],
  );

  const forget = useCallback((id: string) => {
    jobsRef.current.delete(id);
    statusRef.current.delete(id);
    orderRef.current = orderRef.current.filter((other) => other !== id);
  }, []);

  const stop = useCallback((id: string) => {
    abortRef.current.get(id)?.abort();
    abortRef.current.delete(id);
    xhrRef.current.get(id)?.abort();
    xhrRef.current.delete(id);
  }, []);

  const pauseItem = useCallback(
    (id: string) => {
      const status = statusRef.current.get(id);
      if (status !== "uploading" && status !== "retrying" && status !== "queued") return;
      // Marked paused before the abort so the job's catch reads the intent.
      patchItem(id, { status: "paused", retryAttempt: undefined, retryMax: undefined });
      stop(id);
      pump();
    },
    [patchItem, pump, stop],
  );

  const resumeItem = useCallback(
    (id: string) => {
      if (statusRef.current.get(id) !== "paused") return;
      // A presigned PUT has no resume point, so the transfer starts over.
      patchItem(id, { status: "queued", progress: 0, error: undefined });
      pump();
    },
    [patchItem, pump],
  );

  const retryItem = useCallback(
    (id: string) => {
      if (statusRef.current.get(id) !== "error") return;
      patchItem(id, { status: "queued", progress: 0, error: undefined, retryAttempt: undefined, retryMax: undefined });
      pump();
    },
    [patchItem, pump],
  );

  const cancelItem = useCallback(
    (id: string) => {
      forget(id);
      stop(id);
      setItems((current) => current.filter((item) => item.id !== id));
      pump();
    },
    [forget, pump, stop],
  );

  const cancelAll = useCallback(() => {
    for (const id of [...orderRef.current]) {
      if (statusRef.current.get(id) === "done") continue;
      forget(id);
      stop(id);
    }
    setItems((current) => current.filter((item) => statusRef.current.get(item.id) === "done"));
  }, [forget, stop]);

  const dismiss = useCallback(() => {
    for (const id of [...orderRef.current]) {
      forget(id);
      stop(id);
    }
    deploymentRef.current.clear();
    existingNamesRef.current.clear();
    batchMetaRef.current.clear();
    completedByBatchRef.current.clear();
    retargetRef.current.clear();
    setItems([]);
  }, [forget, stop]);

  /* ---------------- batch retargeting (attach-later) ---------------- */

  /**
   * "The batch attaches the moment the deployment exists": every job of the
   * batch that hasn't saved yet now files under the new target, and records
   * already written are re-pointed one at a time — one failure costs one
   * recording, not the batch.
   */
  const retargetBatch = useCallback(
    async (batchKey: string, target: UploadTarget): Promise<{ moved: number; failed: number }> => {
      const meta = batchMetaRef.current.get(batchKey);
      if (!meta) return { moved: 0, failed: 0 };
      retargetRef.current.set(batchKey, target);

      const destination = await resolveTarget(target, meta);
      if (!destination) return { moved: 0, failed: 0 };

      const repoOption = jobRepoOption(meta);
      const done = completedByBatchRef.current.get(batchKey) ?? [];
      let moved = 0;
      let failed = 0;
      for (const record of done) {
        if (record.deploymentUri === destination) {
          moved += 1;
          continue;
        }
        try {
          await updateRecordingDeployment(record.rkey, destination, repoOption);
          record.deploymentUri = destination;
          moved += 1;
        } catch {
          failed += 1;
        }
      }
      // The destination gained recordings — a stale dedup set must not skip
      // legitimately new files from a card read later.
      existingNamesRef.current.delete(destination);
      return { moved, failed };
    },
    [jobRepoOption, resolveTarget],
  );

  const batchInfo = useCallback(
    (batchKey: string): { repoDid: string | null; pending: number; total: number } | null => {
      const meta = batchMetaRef.current.get(batchKey);
      if (!meta) return null;
      let pending = 0;
      let total = 0;
      for (const item of items) {
        if (item.batchKey !== batchKey) continue;
        total += 1;
        if (item.status !== "done") pending += 1;
      }
      return { repoDid: meta.repoDid, pending, total };
    },
    [items],
  );

  const busy = useMemo(() => items.some((item) => item.status !== "done"), [items]);

  /* A full page load kills in-flight transfers — client navigation doesn't. */
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  const value = useMemo<UploadTrayApi>(
    () => ({
      uiEnabled,
      items,
      busy,
      enqueue,
      pauseItem,
      resumeItem,
      retryItem,
      cancelItem,
      cancelAll,
      dismiss,
      retargetBatch,
      batchInfo,
      expanded,
      setExpanded,
    }),
    [batchInfo, busy, cancelAll, cancelItem, dismiss, enqueue, expanded, items, pauseItem, resumeItem, retargetBatch, retryItem, uiEnabled],
  );

  return <UploadTrayContext.Provider value={value}>{children}</UploadTrayContext.Provider>;
}

/** The tray API, or null outside the provider (tests, isolated stories). */
export function useUploadTrayOptional(): UploadTrayApi | null {
  return useContext(UploadTrayContext);
}

export function useUploadTray(): UploadTrayApi {
  const value = useContext(UploadTrayContext);
  if (!value) throw new Error("useUploadTray must be used inside <UploadTrayProvider>");
  return value;
}
