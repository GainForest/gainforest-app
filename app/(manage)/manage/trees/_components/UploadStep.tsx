"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DatabaseIcon,
  ImageDown,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createMultimediaFromFile,
  createMultimediaFromUrl,
  createRecord,
  deleteRecord,
  getDatasetRecord,
  incrementDatasetRecordCount,
  putRecord,
} from "../../_lib/mutations";
import { occurrenceInputToRecord } from "../../_lib/upload/occurrence-adapter";
import { buildTreeDynamicProperties } from "../../_lib/upload/tree-dynamic-properties";
import { getUploadTimeEstimate } from "../../_lib/upload/time-estimate";
import {
  checkUploadRowsAgainstSelectedSite,
  fetchUploadSiteBoundary,
  type SkippedBoundaryRow,
  type UploadableBoundaryRow,
} from "../../_lib/upload/site-boundary";
import type {
  PhotoEntry,
  TreeUploadRowAttentionSummary,
  ValidatedRow,
} from "../../_lib/upload/types";
import {
  createTreeUploadRowAttentionSummary,
  getTreeUploadRowAttentionKindLabel,
  getValidatedRowLabel,
} from "../../_lib/upload/row-attention";
import { type UploadDatasetSelection } from "../../_lib/upload/upload-dataset-selection";
import type { UploadSiteSelection } from "../../_lib/upload/site-selection";
import {
  loadKoboMediaZipArchive,
  readKoboMediaZipEntryAsSerializableFile,
  type KoboMediaZipArchive,
} from "../../_lib/upload/kobo-media-zip";
import { clearPendingUpload } from "./upload-session";
import { useUploadStepEffects } from "./useUploadStepEffects";

type RowStatus =
  | { state: "pending" }
  | { state: "uploading" }
  | { state: "success"; occurrenceUri: string; photoCount: number }
  | { state: "partial"; occurrenceUri: string; photoCount: number; error: string }
  | { state: "error"; error: string };

type UploadProgress = {
  current: number;
  total: number;
  successes: number;
  partials: number;
  failures: number;
  currentRow: string;
};

type PhotoFetchStatus = {
  inProgressCount: number;
  successCount: number;
  failureCount: number;
  lastError: string | null;
};

type PhotoFetchProgress = {
  current: number;
  total: number;
  successes: number;
  failures: number;
};

type PhotoUploadQueueEntry = {
  rowIndex: number;
  photo: PhotoEntry;
};

type UploadStepProps = {
  uploadId: string;
  did: string;
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  koboMediaZipFile: File | null;
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection | null;
  backLabel: string;
  onBack: () => void;
  onComplete: () => void;
};

function getInitialRowStatuses(rows: ValidatedRow[], skippedRows: SkippedBoundaryRow[]): RowStatus[] {
  const statuses = rows.map<RowStatus>(() => ({ state: "pending" }));
  for (const skipped of skippedRows) {
    statuses[skipped.rowIndex] = { state: "error", error: skipped.message };
  }
  return statuses;
}

function buildPhotoFetchQueue(rows: ValidatedRow[], skippedRowIndexes: ReadonlySet<number>): PhotoUploadQueueEntry[] {
  const queue: PhotoUploadQueueEntry[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    if (skippedRowIndexes.has(rowIndex)) continue;
    const row = rows[rowIndex];
    if (!row?.photos) continue;
    for (const photo of row.photos) queue.push({ rowIndex, photo });
  }
  return queue;
}

function getInitialPhotoFetchStatus(): PhotoFetchStatus {
  return { inProgressCount: 0, successCount: 0, failureCount: 0, lastError: null };
}

function getOccurrenceUriFromStatus(status: RowStatus | undefined): string | null {
  return status?.state === "success" || status?.state === "partial" ? status.occurrenceUri : null;
}

function hasPersistedOccurrence(status: RowStatus | undefined): boolean {
  return getOccurrenceUriFromStatus(status) !== null;
}

function photoErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (
    message.startsWith("Photo ") ||
    message.startsWith("This photo") ||
    message.startsWith("Could not open this photo link") ||
    message.startsWith("Photo link") ||
    message.startsWith("The photo")
  ) {
    return message;
  }
  return "Photo could not be saved.";
}

function fileFromSerializablePhoto(photoFile: { name: string; type: string; arrayBuffer: ArrayBuffer }): File {
  return new File([photoFile.arrayBuffer], photoFile.name, { type: photoFile.type });
}

export default function UploadStep({
  uploadId,
  did,
  validRows,
  previewSkippedRows,
  koboMediaZipFile,
  establishmentMeans,
  datasetSelection,
  siteSelection,
  backLabel,
  onBack,
  onComplete,
}: UploadStepProps) {
  const [uploadStarted, setUploadStarted] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadStartedAtMs, setUploadStartedAtMs] = useState<number | null>(null);
  const [uploadFatalError, setUploadFatalError] = useState<string | null>(null);
  const [datasetUpdateWarning, setDatasetUpdateWarning] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [progress, setProgress] = useState<UploadProgress>({
    current: 0, total: validRows.length, successes: 0, partials: 0, failures: 0, currentRow: "",
  });
  const [rowStatuses, setRowStatuses] = useState<RowStatus[]>(validRows.map(() => ({ state: "pending" as const })));
  const [failedRowsOpen, setFailedRowsOpen] = useState(false);
  const [skippedUploadRowIndexes, setSkippedUploadRowIndexes] = useState<number[]>([]);
  const [photoUris, setPhotoUris] = useState<Map<number, string[]>>(new Map());
  const [photoFetchStarted, setPhotoFetchStarted] = useState(false);
  const [photoFetchDone, setPhotoFetchDone] = useState(false);
  const [photoFetchStartedAtMs, setPhotoFetchStartedAtMs] = useState<number | null>(null);
  const [photoFetchStatuses, setPhotoFetchStatuses] = useState<Record<number, PhotoFetchStatus>>({});
  const [photoFetchProgress, setPhotoFetchProgress] = useState<PhotoFetchProgress>({
    current: 0,
    total: 0,
    successes: 0,
    failures: 0,
  });

  const uploadRef = useRef(false);
  const photoFetchRef = useRef(false);

  const skippedUploadRowIndexSet = useMemo(() => new Set(skippedUploadRowIndexes), [skippedUploadRowIndexes]);
  const photoFetchQueue = useMemo(
    () => buildPhotoFetchQueue(validRows, skippedUploadRowIndexSet),
    [skippedUploadRowIndexSet, validRows],
  );
  const hasPhotoAttachments = photoFetchQueue.length > 0;

  const rowAttentionSummaries = useMemo(() => {
    const uploadAttention = rowStatuses.flatMap((status, rowIndex) => {
      if (status.state !== "error" && status.state !== "partial") return [];
      const row = validRows[rowIndex];
      if (!row) return [];
      return [createTreeUploadRowAttentionSummary({
        sourceRowIndex: row.index,
        rowLabel: getValidatedRowLabel(row),
        messages: [status.error],
        kind: status.state === "partial" ? "partial" : skippedUploadRowIndexSet.has(rowIndex) ? "skipped" : "failed",
      })];
    });
    return [...previewSkippedRows, ...uploadAttention].sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);
  }, [previewSkippedRows, rowStatuses, skippedUploadRowIndexSet, validRows]);

  const runUpload = useCallback(async () => {
    if (uploadRef.current) return;
    uploadRef.current = true;
    const uploadStartMs = Date.now();
    setClockMs(uploadStartMs);
    setUploadStarted(true);
    setUploadStartedAtMs(null);
    setPhotoFetchStartedAtMs(null);
    setUploadFatalError(null);
    setDatasetUpdateWarning(null);
    setPhotoFetchStarted(false);
    setPhotoFetchDone(false);
    setPhotoFetchStatuses({});
    setPhotoUris(new Map());

    let rowsToUpload: UploadableBoundaryRow[] = [];
    let skippedRowsForUpload: SkippedBoundaryRow[] = [];
    let photoFetchQueueForUploadableRows: PhotoUploadQueueEntry[] = [];

    if (!siteSelection) {
      setUploadFatalError("No site selected. Go back and choose or create a site boundary.");
      setClockMs(Date.now());
      setUploadDone(true);
      return;
    }

    try {
      const boundary = await fetchUploadSiteBoundary(siteSelection);
      const siteBoundaryCheck = checkUploadRowsAgainstSelectedSite({ rows: validRows, siteSelection, boundary });
      const skippedRowIndexes = siteBoundaryCheck.skippedRows.map((r) => r.rowIndex);
      const skippedRowIndexSet = new Set(skippedRowIndexes);
      const nextPhotoFetchQueue = siteBoundaryCheck.fatalError ? [] : buildPhotoFetchQueue(validRows, skippedRowIndexSet);

      rowsToUpload = siteBoundaryCheck.rowsToUpload;
      skippedRowsForUpload = siteBoundaryCheck.skippedRows;
      photoFetchQueueForUploadableRows = nextPhotoFetchQueue;

      setSkippedUploadRowIndexes(skippedRowIndexes);
      setRowStatuses(getInitialRowStatuses(validRows, skippedRowsForUpload));
      setPhotoFetchProgress({ current: 0, total: nextPhotoFetchQueue.length, successes: 0, failures: 0 });
      setProgress({
        current: skippedRowsForUpload.length, total: validRows.length,
        successes: 0, partials: 0, failures: skippedRowsForUpload.length, currentRow: "",
      });

      if (siteBoundaryCheck.fatalError) {
        setUploadFatalError(siteBoundaryCheck.fatalError);
        setClockMs(Date.now());
        setUploadDone(true);
        return;
      }
      if (rowsToUpload.length === 0) {
        clearPendingUpload();
        setClockMs(Date.now());
        setUploadDone(true);
        return;
      }
    } catch {
      setUploadFatalError("Could not check the selected drawn map area. Go back, choose or create a site boundary, then try again.");
      setClockMs(Date.now());
      setUploadDone(true);
      return;
    }

    const needsPhotoFolder = photoFetchQueueForUploadableRows.some((entry) => entry.photo.source === "koboZip");
    if (needsPhotoFolder && !koboMediaZipFile) {
      setUploadFatalError(
        "This upload includes photos from a compressed photo folder, but that folder cannot be restored after refreshing or signing in again. Start over and select both the tree file and matching photo folder.",
      );
      setClockMs(Date.now());
      setUploadDone(true);
      return;
    }

    clearPendingUpload();

    // Phase 0: Create tree group if needed
    let datasetUri: string | undefined;
    let datasetRkey: string | undefined;
    let datasetCreatedAt: string | undefined;

    if (datasetSelection.mode === "new" && datasetSelection.name.trim().length > 0) {
      try {
        datasetCreatedAt = new Date().toISOString();
        const dsResult = await createRecord("app.gainforest.dwc.dataset", {
          $type: "app.gainforest.dwc.dataset",
          name: datasetSelection.name.trim(),
          ...(datasetSelection.description.trim() ? { description: datasetSelection.description.trim() } : {}),
          ...(establishmentMeans ? { establishmentMeans } : {}),
          createdAt: datasetCreatedAt,
        });
        datasetUri = dsResult.uri;
        datasetRkey = dsResult.uri.split("/").pop();
      } catch {
        setUploadFatalError("Could not create the tree group. Try again or continue without a group.");
        setClockMs(Date.now());
        setUploadDone(true);
        return;
      }
    } else if (datasetSelection.mode === "existing") {
      try {
        const currentTreeGroup = await getDatasetRecord(datasetSelection.dataset.rkey);
        datasetUri = currentTreeGroup.uri;
        datasetRkey = datasetSelection.dataset.rkey;
        datasetCreatedAt = typeof currentTreeGroup.record.createdAt === "string" ? currentTreeGroup.record.createdAt : undefined;
      } catch {
        setDatasetUpdateWarning("The selected tree group could not be checked, so saved trees will be kept without that group.");
      }
    }

    const rowUploadStartMs = Date.now();
    setClockMs(rowUploadStartMs);
    setUploadStartedAtMs(rowUploadStartMs);

    let successes = 0;
    let partials = 0;
    let failures = skippedRowsForUpload.length;

    // Phase 1: Save trees + measurements
    for (let uploadIndex = 0; uploadIndex < rowsToUpload.length; uploadIndex++) {
      const entry = rowsToUpload[uploadIndex];
      if (!entry) continue;
      const { row, rowIndex } = entry;
      const speciesName = row.occurrence.scientificName || `Row ${rowIndex + 1}`;

      setRowStatuses((prev) => { const next = [...prev]; next[rowIndex] = { state: "uploading" }; return next; });
      setProgress((prev) => ({ ...prev, current: Math.min(skippedRowsForUpload.length + uploadIndex + 1, validRows.length), currentRow: speciesName }));
      setClockMs(Date.now());

      try {
        const occurrence = {
          ...row.occurrence,
          ...(establishmentMeans ? { establishmentMeans } : {}),
          siteRef: siteSelection.uri,
          ...(datasetUri ? { datasetRef: datasetUri } : {}),
          dynamicProperties: buildTreeDynamicProperties(datasetUri),
        };
        const occRecord = occurrenceInputToRecord(occurrence);
        const occResult = await createRecord("app.gainforest.dwc.occurrence", occRecord as Record<string, unknown>);

        if (row.floraMeasurement) {
          try {
            await createRecord("app.gainforest.dwc.measurement", {
              $type: "app.gainforest.dwc.measurement",
              occurrenceRef: occResult.uri,
              ...(row.floraMeasurement.dbh ? { dbh: row.floraMeasurement.dbh } : {}),
              ...(row.floraMeasurement.totalHeight ? { totalHeight: row.floraMeasurement.totalHeight } : {}),
              ...(row.floraMeasurement.diameter ? { basalDiameter: row.floraMeasurement.diameter } : {}),
              ...(row.floraMeasurement.canopyCoverPercent ? { canopyCoverPercent: row.floraMeasurement.canopyCoverPercent } : {}),
              createdAt: new Date().toISOString(),
            });
          } catch {
            // Measurement failed - mark as partial but keep the saved tree.
            partials += 1;
            setRowStatuses((prev) => {
              const next = [...prev];
              next[rowIndex] = { state: "partial", occurrenceUri: occResult.uri, photoCount: 0, error: "Tree saved but measurement could not be added." };
              return next;
            });
            setProgress((prev) => ({ ...prev, successes, partials, failures }));
            continue;
          }
        }

        successes += 1;
        setRowStatuses((prev) => { const next = [...prev]; next[rowIndex] = { state: "success", occurrenceUri: occResult.uri, photoCount: 0 }; return next; });
      } catch (err) {
        failures += 1;
        setRowStatuses((prev) => {
          const next = [...prev];
          next[rowIndex] = { state: "error", error: err instanceof Error ? err.message : "Failed to save." };
          return next;
        });
      }

      setProgress((prev) => ({ ...prev, successes, partials, failures }));
      setClockMs(Date.now());
    }

    // Phase 1.5: update tree group count
    const persistedOccurrences = successes + partials;
    if (datasetSelection.mode === "new" && datasetRkey && persistedOccurrences === 0) {
      try {
        await deleteRecord("app.gainforest.dwc.dataset", datasetRkey);
      } catch {
        setDatasetUpdateWarning("The empty tree group could not be removed automatically.");
      }
    } else if (datasetRkey && persistedOccurrences > 0) {
      if (datasetSelection.mode === "existing") {
        try {
          await incrementDatasetRecordCount(datasetRkey, persistedOccurrences);
        } catch {
          setDatasetUpdateWarning("Trees saved, but this tree group's count could not be updated.");
        }
      } else if (datasetSelection.mode === "new") {
        try {
          const dsRecord = {
            $type: "app.gainforest.dwc.dataset",
            name: datasetSelection.name,
            ...(datasetSelection.description.trim() ? { description: datasetSelection.description.trim() } : {}),
            ...(establishmentMeans ? { establishmentMeans } : {}),
            recordCount: persistedOccurrences,
            createdAt: datasetCreatedAt ?? new Date().toISOString(),
          };
          await putRecord("app.gainforest.dwc.dataset", datasetRkey, dsRecord as Record<string, unknown>);
        } catch {
          setDatasetUpdateWarning("Tree group created, but its tree count could not be updated.");
        }
      }
    }

    setClockMs(Date.now());
    setUploadDone(true);
  }, [datasetSelection, establishmentMeans, koboMediaZipFile, siteSelection, validRows]);

  const runPhotoFetch = useCallback(async () => {
    if (photoFetchRef.current) return;
    photoFetchRef.current = true;
    const photoStartMs = Date.now();
    setClockMs(photoStartMs);
    setPhotoFetchStartedAtMs(photoStartMs);
    setPhotoFetchStarted(true);
    setPhotoFetchProgress((prev) => ({ ...prev, total: photoFetchQueue.length }));

    let successes = 0;
    let failures = 0;
    let koboMediaArchivePromise: Promise<KoboMediaZipArchive> | null = null;

    const getKoboMediaArchive = () => {
      if (!koboMediaZipFile) return null;
      koboMediaArchivePromise ??= loadKoboMediaZipArchive(koboMediaZipFile);
      return koboMediaArchivePromise;
    };

    for (let photoIndex = 0; photoIndex < photoFetchQueue.length; photoIndex++) {
      const entry = photoFetchQueue[photoIndex];
      if (!entry) continue;
      const { rowIndex, photo } = entry;
      const occurrenceUri = getOccurrenceUriFromStatus(rowStatuses[rowIndex]);

      if (!occurrenceUri) {
        failures += 1;
        setPhotoFetchStatuses((prev) => ({
          ...prev,
          [rowIndex]: {
            ...(prev[rowIndex] ?? getInitialPhotoFetchStatus()),
            failureCount: (prev[rowIndex]?.failureCount ?? 0) + 1,
            lastError: "Tree could not be saved, so its photo was skipped.",
          },
        }));
        setPhotoFetchProgress((prev) => ({ ...prev, current: photoIndex + 1, failures }));
        continue;
      }

      setPhotoFetchStatuses((prev) => ({
        ...prev,
        [rowIndex]: {
          ...(prev[rowIndex] ?? getInitialPhotoFetchStatus()),
          inProgressCount: (prev[rowIndex]?.inProgressCount ?? 0) + 1,
        },
      }));
      setPhotoFetchProgress((prev) => ({ ...prev, current: photoIndex + 1 }));

      try {
        const result = photo.source === "url"
          ? await createMultimediaFromUrl({
              url: photo.url,
              occurrenceRef: occurrenceUri,
              siteRef: siteSelection?.uri,
              subjectPart: photo.subjectPart,
            })
          : await (async () => {
              const archivePromise = getKoboMediaArchive();
              if (!archivePromise) {
                throw new Error("The photo folder is no longer available. Start over, select the matching photo folder, and try again.");
              }
              const archive = await archivePromise;
              const photoFile = await readKoboMediaZipEntryAsSerializableFile({
                archive,
                entryPath: photo.entryPath,
                fileName: photo.fileName,
                mimeType: photo.mimeType,
              });
              return createMultimediaFromFile({
                imageFile: fileFromSerializablePhoto(photoFile),
                occurrenceRef: occurrenceUri,
                siteRef: siteSelection?.uri,
                subjectPart: photo.subjectPart,
                caption: `Imported from photo folder: ${photo.fileName}`,
                format: photoFile.type,
              });
            })();

        successes += 1;
        setPhotoFetchStatuses((prev) => ({
          ...prev,
          [rowIndex]: {
            ...(prev[rowIndex] ?? getInitialPhotoFetchStatus()),
            inProgressCount: Math.max(0, (prev[rowIndex]?.inProgressCount ?? 0) - 1),
            successCount: (prev[rowIndex]?.successCount ?? 0) + 1,
          },
        }));
        setPhotoUris((prev) => {
          const next = new Map(prev);
          const existing = next.get(rowIndex) ?? [];
          next.set(rowIndex, [...existing, result.uri]);
          return next;
        });
        setRowStatuses((prev) => {
          const next = [...prev];
          const status = next[rowIndex];
          if (status?.state === "success" || status?.state === "partial") {
            next[rowIndex] = { ...status, photoCount: status.photoCount + 1 };
          }
          return next;
        });
      } catch (error) {
        failures += 1;
        setPhotoFetchStatuses((prev) => ({
          ...prev,
          [rowIndex]: {
            ...(prev[rowIndex] ?? getInitialPhotoFetchStatus()),
            inProgressCount: Math.max(0, (prev[rowIndex]?.inProgressCount ?? 0) - 1),
            failureCount: (prev[rowIndex]?.failureCount ?? 0) + 1,
            lastError: photoErrorMessage(error),
          },
        }));
      }

      setPhotoFetchProgress((prev) => ({ ...prev, successes, failures }));
      setClockMs(Date.now());
    }

    setClockMs(Date.now());
    setPhotoFetchDone(true);
  }, [koboMediaZipFile, photoFetchQueue, rowStatuses, siteSelection?.uri]);

  const { current, total: uploadTotal, successes, partials, failures, currentRow } = progress;
  const completedRows = successes + partials + failures;
  const progressPercent = uploadTotal > 0 ? Math.round((current / uploadTotal) * 100) : 0;
  const progressLabel = current > 0
    ? `Saving row ${current} of ${uploadTotal}${currentRow ? ` — ${currentRow}` : ""}…`
    : "Preparing to save…";

  const treeUploadTimeEstimate = getUploadTimeEstimate({
    startedAtMs: uploadStartedAtMs, nowMs: clockMs,
    completedUnits: completedRows, totalUnits: uploadTotal,
    isComplete: uploadDone, unitLabel: "tree",
  });

  const totalFailureCount = failures + previewSkippedRows.length;
  const persistedCount = successes + partials;
  const attentionCount = rowAttentionSummaries.length;
  const hasPhotoFetchWork = hasPhotoAttachments && persistedCount > 0;
  const allPhasesComplete = uploadFatalError ? uploadDone : uploadDone && (!hasPhotoFetchWork || photoFetchDone);
  const photoFailureCount = photoFetchProgress.failures;
  const allSucceeded = allPhasesComplete && totalFailureCount === 0 && partials === 0 && photoFailureCount === 0 && !uploadFatalError;
  const someFailed = allPhasesComplete && (attentionCount > 0 || photoFailureCount > 0) && !uploadFatalError;
  const isUploadInProgress = uploadStarted && !allPhasesComplete;
  const showBackNavigation = !uploadDone;
  const hasUploadedTrees = persistedCount > 0;

  const selectedDatasetName =
    datasetSelection.mode === "new" ? datasetSelection.name :
    datasetSelection.mode === "existing" ? datasetSelection.dataset.name : null;

  const photoFetchPercent = photoFetchProgress.total > 0
    ? Math.round((photoFetchProgress.current / photoFetchProgress.total) * 100)
    : 0;
  const completedPhotoFetches = photoFetchProgress.successes + photoFetchProgress.failures;
  const photoFetchTimeEstimate = getUploadTimeEstimate({
    startedAtMs: photoFetchStartedAtMs,
    nowMs: clockMs,
    completedUnits: completedPhotoFetches,
    totalUnits: photoFetchProgress.total,
    isComplete: photoFetchDone,
    unitLabel: "photo",
  });

  useUploadStepEffects({
    did,
    uploadId,
    validRows,
    previewSkippedRows,
    establishmentMeans,
    datasetSelection,
    siteSelection,
    uploadStarted,
    runUpload,
    uploadDone,
    hasPhotoAttachments,
    persistedCount,
    photoFetchStarted,
    uploadFatalError,
    runPhotoFetch,
    isUploadInProgress,
    setClockMs,
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Saving your trees</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Saving {uploadTotal} tree{uploadTotal !== 1 ? "s" : ""} to GainForest.
        </p>
        {siteSelection && <p className="text-xs text-muted-foreground mt-1">Assigning to {siteSelection.name}.</p>}
        {selectedDatasetName && (
          <p className="text-xs text-muted-foreground mt-1">
            {datasetSelection.mode === "existing" ? `Adding to ${selectedDatasetName}.` : `Creating group "${selectedDatasetName}".`}
          </p>
        )}
      </div>

      {isUploadInProgress && (
        <div className="flex items-start gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Do not refresh or close this page</p>
            <p>Keep this tab open until trees and photos finish saving.</p>
          </div>
        </div>
      )}

      {!uploadDone && (
        <div className="space-y-2">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">{progressLabel}</span>
            <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{treeUploadTimeEstimate.label}</span>
              <span className="font-mono">{progressPercent}%</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>{successes} succeeded{partials > 0 ? `, ${partials} need follow-up` : ""}{`, ${failures} failed`}</p>
            <p>{treeUploadTimeEstimate.description}</p>
          </div>
        </div>
      )}

      {uploadFatalError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{uploadFatalError}</span>
        </div>
      )}

      {allSucceeded && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Successfully saved {successes} tree{successes !== 1 ? "s" : ""}{photoFetchProgress.total > 0 ? ` and ${photoFetchProgress.successes} photo${photoFetchProgress.successes !== 1 ? "s" : ""}` : ""}.</span>
        </div>
      )}

      {someFailed && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {persistedCount} saved{partials > 0 ? `, ${partials} need follow-up` : ""}
            {totalFailureCount > 0 ? `, ${totalFailureCount} skipped or failed` : ""}
            {photoFailureCount > 0 ? `, ${photoFailureCount} photo${photoFailureCount !== 1 ? "s" : ""} could not be saved` : ""}.
          </span>
        </div>
      )}

      {datasetUpdateWarning && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{datasetUpdateWarning}</span>
        </div>
      )}

      {uploadDone && hasPhotoFetchWork && !uploadFatalError && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2">
            <ImageDown className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">{photoFetchDone ? "Photos saved" : "Saving photos…"}</h3>
          </div>

          {!photoFetchDone && (
            <>
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">Photo {photoFetchProgress.current} of {photoFetchProgress.total}</span>
                <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{photoFetchTimeEstimate.label}</span>
                  <span className="font-mono">{photoFetchPercent}%</span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${photoFetchPercent}%` }} />
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {photoFetchProgress.successes} saved{photoFetchProgress.failures > 0 ? `, ${photoFetchProgress.failures} could not be saved` : ""} of {photoFetchProgress.total} photo{photoFetchProgress.total !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground">{photoFetchTimeEstimate.description}</p>

          {photoFetchDone && photoFetchProgress.failures > 0 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Some photos could not be saved. Your trees are still saved.
            </p>
          )}
        </div>
      )}

      {!uploadFatalError && (
        <div className="rounded-lg border overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {validRows.map((row, i) => {
              const status = rowStatuses[i];
              const species = getValidatedRowLabel(row);
              const rowPhotos = photoUris.get(i) ?? [];
              const photoStatus = photoFetchStatuses[i];
              const hasOccurrence = hasPersistedOccurrence(status);
              return (
                <div key={row.index} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-6 shrink-0">{row.index + 1}</span>
                  <span className="flex-1 min-w-0 truncate">{species}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {rowPhotos.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Camera className="h-3 w-3" />
                        {rowPhotos.length}
                      </span>
                    )}
                    {(photoStatus?.inProgressCount ?? 0) > 0 && hasOccurrence && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Saving photo">
                        <ImageDown className="h-3 w-3 animate-pulse" />
                      </span>
                    )}
                    {(photoStatus?.failureCount ?? 0) > 0 && (
                      <span className="text-xs text-yellow-500" title={photoStatus?.lastError ?? "Photo could not be saved."}>
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
                    {status?.state === "pending" && <span className="text-xs text-muted-foreground">Pending</span>}
                    {status?.state === "uploading" && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                    {status?.state === "success" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    {status?.state === "partial" && <span title={status.error}><AlertTriangle className="h-4 w-4 text-yellow-500" /></span>}
                    {status?.state === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rowAttentionSummaries.length > 0 && !uploadFatalError && (
        <div className="rounded-lg border border-destructive/30 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/30 transition-colors"
            onClick={() => setFailedRowsOpen((v) => !v)}
          >
            <span className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              {attentionCount} row{attentionCount !== 1 ? "s" : ""} need attention
            </span>
            {failedRowsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {failedRowsOpen && (
            <div className="border-t border-destructive/20 px-4 py-3">
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {rowAttentionSummaries.map((summary) => (
                  <li key={`${summary.kind}-${summary.sourceRowIndex}`} className="text-xs border border-destructive/20 rounded-md p-2 space-y-1">
                    <p className="font-medium">Row {summary.sourceRowIndex + 1} — {summary.rowLabel}</p>
                    <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{getTreeUploadRowAttentionKindLabel(summary.kind)}</p>
                    <ul className="space-y-0.5">
                      {summary.messages.map((msg, idx) => <li key={idx} className="text-destructive">{msg}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className={`flex items-center pt-2 border-t border-border ${showBackNavigation ? "justify-between" : "justify-end"}`}>
        {showBackNavigation && (
          <Button variant="outline" onClick={onBack} disabled={isUploadInProgress}>{backLabel}</Button>
        )}
        {allPhasesComplete && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onComplete}>
              {uploadFatalError ? "Start Over" : "Add More Trees"}
            </Button>
            {!uploadFatalError && hasUploadedTrees && (
              <Button onClick={onComplete}>
                <DatabaseIcon />
                Done
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
