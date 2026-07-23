"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { useModal } from "@/components/ui/modal/context";
import { TREE_UPLOAD_EVENTS, type TreeUploadEventPayload } from "@/lib/analytics/events";
import { trackTreeUploadEvent } from "@/lib/analytics/hotjar";
import { links, type ManageTarget } from "@/lib/links";
import {
  appendExistingDataset,
  createMeasurement,
  createMultimediaFromFile,
  createMultimediaFromUrl,
  createRecord,
  deleteRecord,
  detachOccurrenceFromDataset,
  incrementDatasetRecordCount,
} from "../../_lib/mutations";
import { occurrenceInputToRecord } from "../../_lib/upload/occurrence-adapter";
import {
  APPEND_EXISTING_DWC_DATASET_CLIENT_ROWS,
  toAppendExistingDatasetRows,
} from "../../_lib/upload/append-existing-dataset";
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
import { createTreeUploadRowAttentionSummary } from "../../_lib/upload/row-attention";
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
  target: ManageTarget;
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  koboMediaZipFile: File | null;
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection | null;
  mutationDisabledReason?: string | null;
  backLabel: string;
  onBack: () => void;
  onUploadMore: () => void;
  onDone: () => void;
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

function getOccurrenceRkey(status: RowStatus | undefined): string | null {
  const occurrenceUri = getOccurrenceUriFromStatus(status);
  if (!occurrenceUri) return null;
  const rkey = occurrenceUri.split("/").pop();
  return rkey && rkey.length > 0 ? rkey : null;
}

function isTreeGroupUnavailableMessage(message: string): boolean {
  return message.toLowerCase().includes("tree group") && (
    message.toLowerCase().includes("no longer available") ||
    message.toLowerCase().includes("disappeared")
  );
}

function fileFromSerializablePhoto(photoFile: { name: string; type: string; arrayBuffer: ArrayBuffer }): File {
  return new File([photoFile.arrayBuffer], photoFile.name, { type: photoFile.type });
}

export default function UploadStep({
  uploadId,
  did,
  target,
  validRows,
  previewSkippedRows,
  koboMediaZipFile,
  establishmentMeans,
  datasetSelection,
  siteSelection,
  mutationDisabledReason = null,
  backLabel,
  onBack,
  onUploadMore,
  onDone,
}: UploadStepProps) {
  const t = useTranslations("common.manageTrees.upload");
  const { pushModal, show } = useModal();
  const writeOptions = useMemo(() => target.kind === "group" ? { repo: target.did } : undefined, [target.did, target.kind]);
  const [uploadStarted, setUploadStarted] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadStartedAtMs, setUploadStartedAtMs] = useState<number | null>(null);
  const [uploadFatalError, setUploadFatalError] = useState<string | null>(null);
  const [datasetUpdateWarning, setDatasetUpdateWarning] = useState<string | null>(null);
  const [uploadedDatasetUri, setUploadedDatasetUri] = useState<string | null>(null);
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
  const completionModalShownRef = useRef(false);

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
        rowLabel: row.occurrence.scientificName || t("row", { number: row.index + 1 }),
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
    if (mutationDisabledReason) {
      setClockMs(uploadStartMs);
      setUploadStarted(true);
      setUploadFatalError(mutationDisabledReason);
      setUploadDone(true);
      return;
    }
    const previewSkippedCount = previewSkippedRows.length;
    const sourceTotalRows = validRows.length + previewSkippedCount;
    setClockMs(uploadStartMs);
    setUploadStarted(true);
    setUploadStartedAtMs(null);
    setPhotoFetchStartedAtMs(null);
    setUploadFatalError(null);
    setDatasetUpdateWarning(null);
    setUploadedDatasetUri(null);
    setPhotoFetchStarted(false);
    setPhotoFetchDone(false);
    setPhotoFetchStatuses({});
    setPhotoUris(new Map());

    let rowsToUpload: UploadableBoundaryRow[] = [];
    let skippedRowsForUpload: SkippedBoundaryRow[] = [];
    let photoFetchQueueForUploadableRows: PhotoUploadQueueEntry[] = [];

    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_STARTED, {
      uploadId,
      datasetMode: datasetSelection.mode,
      totalRows: sourceTotalRows,
      validRows: validRows.length,
      invalidRows: previewSkippedCount,
      photoTotal: photoFetchQueue.length,
      hasKoboZip: koboMediaZipFile !== null,
    });

    if (!siteSelection) {
      const completedAtMs = Date.now();
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_FAILED, {
        uploadId,
        datasetMode: datasetSelection.mode,
        totalRows: sourceTotalRows,
        photoTotal: 0,
        failureReason: "site_selection_missing",
        durationSeconds: Math.round((completedAtMs - uploadStartMs) / 1_000),
      });
      setUploadFatalError(t("fatal.noSite"));
      setClockMs(completedAtMs);
      setUploadDone(true);
      return;
    }

    try {
      const boundary = await fetchUploadSiteBoundary(siteSelection);
      const siteBoundaryCheck = checkUploadRowsAgainstSelectedSite({
        rows: validRows,
        siteSelection,
        boundary,
        messages: {
          differentSite: t("boundary.differentSite"),
          invalidBoundary: t("boundary.invalid"),
          outsideBoundary: (distance) => t("boundary.outside", { distance }),
          unknownDistance: t("boundary.unknownDistance"),
        },
      });
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
        const completedAtMs = Date.now();
        trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_FAILED, {
          uploadId,
          datasetMode: datasetSelection.mode,
          totalRows: sourceTotalRows,
          photoTotal: photoFetchQueueForUploadableRows.length,
          failureReason: "site_boundary_validation_failed",
          durationSeconds: Math.round((completedAtMs - uploadStartMs) / 1_000),
        });
        setUploadFatalError(siteBoundaryCheck.fatalError);
        setClockMs(completedAtMs);
        setUploadDone(true);
        return;
      }
      if (rowsToUpload.length === 0) {
        const completedAtMs = Date.now();
        clearPendingUpload();
        trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_COMPLETED, {
          uploadId,
          datasetMode: datasetSelection.mode,
          totalRows: sourceTotalRows,
          savedRows: 0,
          partialRows: 0,
          failedRows: previewSkippedCount + siteBoundaryCheck.skippedRows.length,
          photoTotal: 0,
          hasKoboZip: false,
          durationSeconds: Math.round((completedAtMs - uploadStartMs) / 1_000),
        });
        setClockMs(completedAtMs);
        setUploadDone(true);
        return;
      }
    } catch {
      const completedAtMs = Date.now();
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_FAILED, {
        uploadId,
        datasetMode: datasetSelection.mode,
        totalRows: sourceTotalRows,
        photoTotal: photoFetchQueueForUploadableRows.length,
        failureReason: "site_boundary_validation_failed",
        durationSeconds: Math.round((completedAtMs - uploadStartMs) / 1_000),
      });
      setUploadFatalError(t("fatal.siteBoundary"));
      setClockMs(completedAtMs);
      setUploadDone(true);
      return;
    }

    const needsPhotoFolder = photoFetchQueueForUploadableRows.some((entry) => entry.photo.source === "koboZip");
    if (needsPhotoFolder && !koboMediaZipFile) {
      const completedAtMs = Date.now();
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_FAILED, {
        uploadId,
        datasetMode: datasetSelection.mode,
        totalRows: sourceTotalRows,
        photoTotal: photoFetchQueueForUploadableRows.length,
        failureReason: "missing_kobo_media_zip",
        durationSeconds: Math.round((completedAtMs - uploadStartMs) / 1_000),
      });
      setUploadFatalError(t("fatal.photoFolder"));
      setClockMs(completedAtMs);
      setUploadDone(true);
      return;
    }

    clearPendingUpload();

    // Phase 0: Create tree group if needed
    let datasetUri: string | undefined;
    let datasetRkey: string | undefined;

    if (datasetSelection.mode === "new" && datasetSelection.name.trim().length > 0) {
      try {
        const dsResult = await createRecord("app.gainforest.dwc.dataset", {
          $type: "app.gainforest.dwc.dataset",
          name: datasetSelection.name.trim(),
          ...(datasetSelection.description.trim() ? { description: datasetSelection.description.trim() } : {}),
          ...(establishmentMeans ? { establishmentMeans } : {}),
          createdAt: new Date().toISOString(),
        }, undefined, writeOptions);
        datasetUri = dsResult.uri;
        datasetRkey = dsResult.uri.split("/").pop();
        setUploadedDatasetUri(dsResult.uri);
      } catch {
        const completedAtMs = Date.now();
        trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_FAILED, {
          uploadId,
          datasetMode: datasetSelection.mode,
          totalRows: sourceTotalRows,
          photoTotal: photoFetchQueueForUploadableRows.length,
          failureReason: "tree_group_create_failed",
          durationSeconds: Math.round((completedAtMs - uploadStartMs) / 1_000),
        });
        setUploadFatalError(t("fatal.treeGroup"));
        setClockMs(completedAtMs);
        setUploadDone(true);
        return;
      }
    } else if (datasetSelection.mode === "existing") {

      const rowUploadStartMs = Date.now();
      setClockMs(rowUploadStartMs);
      setUploadStartedAtMs(rowUploadStartMs);

      const appendExistingDatasetRows = toAppendExistingDatasetRows(
        rowsToUpload.map(({ row }) => row),
        siteSelection.uri,
      );
      const nextStatuses = getInitialRowStatuses(validRows, skippedRowsForUpload);
      let successes = 0;
      let partials = 0;
      let failures = skippedRowsForUpload.length;
      let stopExistingTreeGroupUpload = false;

      const detachUploadedRowsFromUnavailableTreeGroup = async (statuses: RowStatus[], rowIndexes: number[]) => {
        let demotedSuccesses = 0;

        for (const index of rowIndexes) {
          const status = statuses[index];
          if (!status || (status.state !== "success" && status.state !== "partial")) continue;

          const baseError = t("errors.groupDetached");
          const fallbackError = t("errors.groupDetachFailed");
          const nextBaseError = status.state === "partial" ? `${status.error} ${baseError}` : baseError;
          const nextFallbackError = status.state === "partial" ? `${status.error} ${fallbackError}` : fallbackError;
          const rkey = getOccurrenceRkey(status);

          if (!rkey) {
            if (status.state === "success") demotedSuccesses += 1;
            statuses[index] = { state: "partial", occurrenceUri: status.occurrenceUri, photoCount: status.photoCount, error: nextFallbackError };
            continue;
          }

          try {
            await detachOccurrenceFromDataset(rkey, writeOptions);
            if (status.state === "success") demotedSuccesses += 1;
            statuses[index] = { state: "partial", occurrenceUri: status.occurrenceUri, photoCount: status.photoCount, error: nextBaseError };
          } catch {
            if (status.state === "success") demotedSuccesses += 1;
            statuses[index] = { state: "partial", occurrenceUri: status.occurrenceUri, photoCount: status.photoCount, error: nextFallbackError };
          }
        }

        return demotedSuccesses;
      };

      for (
        let chunkStart = 0;
        chunkStart < appendExistingDatasetRows.length;
        chunkStart += APPEND_EXISTING_DWC_DATASET_CLIENT_ROWS
      ) {
        const chunkRows = appendExistingDatasetRows.slice(
          chunkStart,
          chunkStart + APPEND_EXISTING_DWC_DATASET_CLIENT_ROWS,
        );
        const chunkEntries = rowsToUpload.slice(
          chunkStart,
          chunkStart + APPEND_EXISTING_DWC_DATASET_CLIENT_ROWS,
        );
        const chunkEnd = chunkStart + chunkRows.length;
        const chunkLabel = chunkEntries.length === 1
          ? (chunkEntries[0]?.row.occurrence.scientificName || t("row", { number: (chunkEntries[0]?.rowIndex ?? chunkStart) + 1 }))
          : t("rowsRange", { start: chunkStart + 1, end: chunkEnd, total: rowsToUpload.length });

        for (const entry of chunkEntries) {
          nextStatuses[entry.rowIndex] = { state: "uploading" };
        }
        setRowStatuses([...nextStatuses]);
        setProgress((prev) => ({
          ...prev,
          current: Math.min(skippedRowsForUpload.length + chunkStart + 1, validRows.length),
          currentRow: chunkLabel,
        }));
        setClockMs(Date.now());

        try {
          const response = await appendExistingDataset({
            datasetRkey: datasetSelection.dataset.rkey,
            rows: chunkRows,
            establishmentMeans,
          }, writeOptions);
          const handledIndexes = new Set<number>();
          setUploadedDatasetUri(response.datasetBecameUnavailable ? null : response.datasetUri);

          for (const result of response.results) {
            const entry = chunkEntries[result.index];
            if (!entry) continue;

            const globalIndex = entry.rowIndex;
            handledIndexes.add(result.index);

            if (result.state === "success") {
              successes += 1;
              nextStatuses[globalIndex] = { state: "success", occurrenceUri: result.occurrenceUri, photoCount: result.photoCount };
              continue;
            }

            if (result.state === "partial") {
              partials += 1;
              if (result.error) console.error("Partial tree save", result.error);
              nextStatuses[globalIndex] = { state: "partial", occurrenceUri: result.occurrenceUri, photoCount: result.photoCount, error: t("rowPartialError") };
              continue;
            }

            failures += 1;
            if (result.error) console.error("Tree save failed", result.error);
            nextStatuses[globalIndex] = { state: "error", error: t("treeSaveError") };
          }

          for (const [chunkIndex] of chunkRows.entries()) {
            const entry = chunkEntries[chunkIndex];
            if (!entry || handledIndexes.has(chunkIndex)) continue;

            failures += 1;
            nextStatuses[entry.rowIndex] = { state: "error", error: t("treeSaveError") };
          }

          if (response.datasetBecameUnavailable) {
            const demotedSuccesses = await detachUploadedRowsFromUnavailableTreeGroup(
              nextStatuses,
              rowsToUpload.slice(0, chunkStart).map((entry) => entry.rowIndex),
            );
            successes -= demotedSuccesses;
            partials += demotedSuccesses;
            setUploadedDatasetUri(null);

            for (let remainingIndex = chunkEnd; remainingIndex < rowsToUpload.length; remainingIndex += 1) {
              const remainingEntry = rowsToUpload[remainingIndex];
              if (!remainingEntry) continue;

              nextStatuses[remainingEntry.rowIndex] = { state: "error", error: t("errors.groupUnavailable") };
              failures += 1;
            }
            stopExistingTreeGroupUpload = true;
          }
        } catch (error) {
          console.error("Tree chunk save failed", error);
          const rawMessage = error instanceof Error ? error.message : "";
          const treeGroupUnavailable = isTreeGroupUnavailableMessage(rawMessage);
          const chunkMessage = treeGroupUnavailable
            ? t("errors.groupUnavailable")
            : t("errors.chunkUnconfirmed");

          if (treeGroupUnavailable) {
            const demotedSuccesses = await detachUploadedRowsFromUnavailableTreeGroup(
              nextStatuses,
              rowsToUpload.slice(0, chunkStart).map((entry) => entry.rowIndex),
            );
            successes -= demotedSuccesses;
            partials += demotedSuccesses;
            setUploadedDatasetUri(null);
          }

          for (let remainingIndex = chunkStart; remainingIndex < rowsToUpload.length; remainingIndex += 1) {
            const remainingEntry = rowsToUpload[remainingIndex];
            if (!remainingEntry) continue;

            nextStatuses[remainingEntry.rowIndex] = { state: "error", error: chunkMessage };
            failures += 1;
          }

          stopExistingTreeGroupUpload = true;
        }

        setRowStatuses([...nextStatuses]);
        setProgress({
          current: successes + partials + failures,
          total: validRows.length,
          successes,
          partials,
          failures,
          currentRow: "",
        });
        setClockMs(Date.now());

        if (stopExistingTreeGroupUpload) break;

      }

      const completedAtMs = Date.now();
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_COMPLETED, {
        uploadId,
        datasetMode: datasetSelection.mode,
        totalRows: sourceTotalRows,
        savedRows: successes + partials,
        partialRows: partials,
        failedRows: previewSkippedCount + failures,
        photoTotal: photoFetchQueueForUploadableRows.length,
        hasKoboZip: koboMediaZipFile !== null,
        durationSeconds: Math.round((completedAtMs - rowUploadStartMs) / 1_000),
      });
      setClockMs(completedAtMs);
      setUploadDone(true);
      return;
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
      const speciesName = row.occurrence.scientificName || t("row", { number: rowIndex + 1 });

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
        const occResult = await createRecord("app.gainforest.dwc.occurrence", occRecord as Record<string, unknown>, undefined, writeOptions);
        const occurrenceRkey = occResult.uri.split("/").pop();

        if (row.floraMeasurement) {
          try {
            await createMeasurement({
              occurrenceRef: occResult.uri,
              flora: {
                dbh: row.floraMeasurement.dbh,
                totalHeight: row.floraMeasurement.totalHeight,
                basalDiameter: row.floraMeasurement.diameter,
                canopyCoverPercent: row.floraMeasurement.canopyCoverPercent,
              },
            }, writeOptions);
          } catch (measurementError) {
            if (occurrenceRkey) {
              try {
                await deleteRecord("app.gainforest.dwc.occurrence", occurrenceRkey, writeOptions);
              } catch {
                partials += 1;
                setRowStatuses((prev) => {
                  const next = [...prev];
                  next[rowIndex] = {
                    state: "partial",
                    occurrenceUri: occResult.uri,
                    photoCount: 0,
                    error: t("errors.measurementCleanupFailed"),
                  };
                  return next;
                });
                setProgress((prev) => ({ ...prev, successes, partials, failures }));
                continue;
              }
            }

            throw measurementError;
          }
        }

        successes += 1;
        setRowStatuses((prev) => { const next = [...prev]; next[rowIndex] = { state: "success", occurrenceUri: occResult.uri, photoCount: 0 }; return next; });
      } catch (err) {
        failures += 1;
        setRowStatuses((prev) => {
          const next = [...prev];
          console.error("Tree save failed", err);
          next[rowIndex] = { state: "error", error: t("treeSaveError") };
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
        await deleteRecord("app.gainforest.dwc.dataset", datasetRkey, writeOptions);
        setUploadedDatasetUri(null);
      } catch {
        setDatasetUpdateWarning(t("datasetCleanupWarning"));
      }
    } else if (datasetSelection.mode === "new" && datasetRkey && persistedOccurrences > 0) {
      try {
        await incrementDatasetRecordCount(datasetRkey, persistedOccurrences, writeOptions);
      } catch {
        setDatasetUpdateWarning(t("groupCountWarning"));
      }
    }

    const completedAtMs = Date.now();
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_COMPLETED, {
      uploadId,
      datasetMode: datasetSelection.mode,
      totalRows: sourceTotalRows,
      savedRows: successes + partials,
      partialRows: partials,
      failedRows: previewSkippedCount + failures,
      photoTotal: photoFetchQueueForUploadableRows.length,
      hasKoboZip: koboMediaZipFile !== null,
      durationSeconds: Math.round((completedAtMs - rowUploadStartMs) / 1_000),
    });
    setClockMs(completedAtMs);
    setUploadDone(true);
  }, [datasetSelection, establishmentMeans, koboMediaZipFile, mutationDisabledReason, photoFetchQueue.length, previewSkippedRows.length, siteSelection, t, uploadId, validRows, writeOptions]);

  const runPhotoFetch = useCallback(async () => {
    if (photoFetchRef.current) return;
    photoFetchRef.current = true;
    const photoStartMs = Date.now();
    setClockMs(photoStartMs);
    setPhotoFetchStartedAtMs(photoStartMs);
    setPhotoFetchStarted(true);
    setPhotoFetchProgress((prev) => ({ ...prev, total: photoFetchQueue.length }));

    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.PHOTO_UPLOAD_STARTED, {
      uploadId,
      datasetMode: datasetSelection.mode,
      totalRows: validRows.length,
      photoTotal: photoFetchQueue.length,
      hasKoboZip: koboMediaZipFile !== null,
    });

    let successes = 0;
    let failures = 0;
    let koboMediaArchivePromise: Promise<KoboMediaZipArchive> | null = null;

    const getKoboMediaArchive = () => {
      if (!koboMediaZipFile) return null;
      koboMediaArchivePromise ??= loadKoboMediaZipArchive(koboMediaZipFile);
      return koboMediaArchivePromise;
    };

    const closeKoboMediaArchive = async () => {
      if (!koboMediaArchivePromise) return;
      const koboMediaArchive = await koboMediaArchivePromise.catch(() => null);
      if (koboMediaArchive) await koboMediaArchive.close();
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
            lastError: t("photoSkipped"),
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
            }, writeOptions)
          : await (async () => {
              const archivePromise = getKoboMediaArchive();
              if (!archivePromise) {
                throw new Error("PHOTO_FOLDER_UNAVAILABLE");
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
                caption: t("importedPhotoCaption", { fileName: photo.fileName }),
                format: photoFile.type,
              }, writeOptions);
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
        console.error("Tree photo save failed", error);
        failures += 1;
        setPhotoFetchStatuses((prev) => ({
          ...prev,
          [rowIndex]: {
            ...(prev[rowIndex] ?? getInitialPhotoFetchStatus()),
            inProgressCount: Math.max(0, (prev[rowIndex]?.inProgressCount ?? 0) - 1),
            failureCount: (prev[rowIndex]?.failureCount ?? 0) + 1,
            lastError: t("photoSaveError"),
          },
        }));
      }

      setPhotoFetchProgress((prev) => ({ ...prev, successes, failures }));
      setClockMs(Date.now());
    }

    await closeKoboMediaArchive();

    const completedAtMs = Date.now();
    const photoEvent = failures > 0
      ? TREE_UPLOAD_EVENTS.PHOTO_UPLOAD_FAILED
      : TREE_UPLOAD_EVENTS.PHOTO_UPLOAD_COMPLETED;
    trackTreeUploadEvent(photoEvent, {
      uploadId,
      datasetMode: datasetSelection.mode,
      totalRows: validRows.length,
      photoTotal: photoFetchQueue.length,
      photoSucceeded: successes,
      photoFailed: failures,
      hasKoboZip: koboMediaZipFile !== null,
      durationSeconds: Math.round((completedAtMs - photoStartMs) / 1_000),
    });
    setClockMs(completedAtMs);
    setPhotoFetchDone(true);
  }, [datasetSelection.mode, koboMediaZipFile, photoFetchQueue, rowStatuses, siteSelection?.uri, t, uploadId, validRows.length, writeOptions]);

  const { current, total: uploadTotal, successes, partials, failures, currentRow } = progress;
  const completedRows = successes + partials + failures;
  const progressPercent = uploadTotal > 0 ? Math.round((current / uploadTotal) * 100) : 0;
  const progressLabel = current > 0
    ? t("savingProgress", { current, total: uploadTotal, row: currentRow })
    : t("preparing");

  const treeUploadTimeEstimate = getUploadTimeEstimate({
    startedAtMs: uploadStartedAtMs, nowMs: clockMs,
    completedUnits: completedRows, totalUnits: uploadTotal,
    isComplete: uploadDone,
    unitLabel: t("time.treeUnit", { count: completedRows }),
    translate: (key, values) => t(`time.${key}` as never, values as never),
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
  const shouldShowCompletionModal = uploadStarted && allPhasesComplete && !uploadFatalError;

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
    unitLabel: t("time.photoUnit", { count: completedPhotoFetches }),
    translate: (key, values) => t(`time.${key}` as never, values as never),
  });

  const sourceTotalCount = uploadTotal + previewSkippedRows.length;
  const treeManagerHref = links.manage.target.trees(target, { dataset: uploadedDatasetUri });
  const treeManagerLabel = uploadedDatasetUri ? t("viewTreeGroup") : t("viewTrees");
  const uploadDurationSeconds = uploadStartedAtMs
    ? Math.max(0, Math.round((clockMs - uploadStartedAtMs) / 1_000))
    : null;
  const completionAnalyticsPayload = useMemo<TreeUploadEventPayload>(() => {
    const payload: TreeUploadEventPayload = {
      uploadId,
      datasetMode: datasetSelection.mode,
      totalRows: sourceTotalCount,
      savedRows: persistedCount,
      partialRows: partials,
      failedRows: totalFailureCount,
      photoTotal: photoFetchProgress.total,
      photoSucceeded: photoFetchProgress.successes,
      photoFailed: photoFetchProgress.failures,
      hasKoboZip: koboMediaZipFile !== null,
    };

    return uploadDurationSeconds === null
      ? payload
      : { ...payload, durationSeconds: uploadDurationSeconds };
  }, [
    datasetSelection.mode,
    koboMediaZipFile,
    partials,
    persistedCount,
    photoFetchProgress.failures,
    photoFetchProgress.successes,
    photoFetchProgress.total,
    sourceTotalCount,
    totalFailureCount,
    uploadDurationSeconds,
    uploadId,
  ]);

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
    allPhasesComplete,
    shouldShowCompletionModal,
    completionModalShownRef,
    total: sourceTotalCount,
    partials,
    failures: totalFailureCount,
    rowAttentionSummaries,
    photoFailureCount,
    treeManagerHref,
    treeManagerLabel,
    completionAnalyticsPayload,
    onUploadMore,
    pushModal,
    show,
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("savingTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("savingTrees", { count: uploadTotal })}
        </p>
        {siteSelection && <p className="text-xs text-muted-foreground mt-1">{t("assigningToSite", { name: siteSelection.name })}</p>}
        {selectedDatasetName && (
          <p className="text-xs text-muted-foreground mt-1">
            {datasetSelection.mode === "existing" ? t("addingToGroup", { name: selectedDatasetName }) : t("creatingGroup", { name: selectedDatasetName })}
          </p>
        )}
        {mutationDisabledReason && !uploadDone ? <p className="mt-2 text-sm text-muted-foreground">{mutationDisabledReason}</p> : null}
      </div>

      {isUploadInProgress && (
        <div className="flex items-start gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t("keepOpenTitle")}</p>
            <p>{t("keepOpenBody")}</p>
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
            <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>{t("progressSummary", { successes, partials, failures })}</p>
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
          <span>{photoFetchProgress.total > 0
            ? t("successWithPhotos", { trees: successes, photos: photoFetchProgress.successes })
            : t("successTrees", { trees: successes })}</span>
        </div>
      )}

      {someFailed && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t("completionWithIssues", { saved: persistedCount, followUp: partials, failed: totalFailureCount, photoFailed: photoFailureCount })}</span>
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
            <h3 className="text-sm font-medium">{photoFetchDone ? t("photosSaved") : t("savingPhotos")}</h3>
          </div>

          {!photoFetchDone && (
            <>
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">{t("photoProgress", { current: photoFetchProgress.current, total: photoFetchProgress.total })}</span>
                <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{photoFetchTimeEstimate.label}</span>
                  <span className="font-mono">{photoFetchPercent}%</span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${photoFetchPercent}%` }} />
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {t("photoSummary", { saved: photoFetchProgress.successes, failed: photoFetchProgress.failures, total: photoFetchProgress.total })}
          </p>
          <p className="text-xs text-muted-foreground">{photoFetchTimeEstimate.description}</p>

          {photoFetchDone && photoFetchProgress.failures > 0 && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              {t("photoFailures")}
            </p>
          )}
        </div>
      )}

      {!uploadFatalError && (
        <div className="rounded-lg border overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {validRows.map((row, i) => {
              const status = rowStatuses[i];
              const species = row.occurrence.scientificName || t("row", { number: row.index + 1 });
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
                      <span className="flex items-center gap-1 text-xs text-muted-foreground" title={t("savingPhoto")}>
                        <ImageDown className="h-3 w-3 animate-pulse" />
                      </span>
                    )}
                    {(photoStatus?.failureCount ?? 0) > 0 && (
                      <span className="text-xs text-yellow-500" title={t("photoSaveError")}>
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
                    {status?.state === "pending" && <span className="text-xs text-muted-foreground">{t("pending")}</span>}
                    {status?.state === "uploading" && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                    {status?.state === "success" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    {status?.state === "partial" && <span title={t("rowPartialError")}><AlertTriangle className="h-4 w-4 text-yellow-500" /></span>}
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
              {t("attentionCount", { count: attentionCount })}
            </span>
            {failedRowsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {failedRowsOpen && (
            <div className="border-t border-destructive/20 px-4 py-3">
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {rowAttentionSummaries.map((summary) => (
                  <li key={`${summary.kind}-${summary.sourceRowIndex}`} className="text-xs border border-destructive/20 rounded-md p-2 space-y-1">
                    <p className="font-medium">{t("rowSummary", { number: summary.sourceRowIndex + 1, label: summary.rowLabel })}</p>
                    <p className="text-xs font-medium text-muted-foreground">{t(`attentionKind.${summary.kind}` as never)}</p>
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
            <Button
              variant="outline"
              onClick={() => {
                if (!uploadFatalError) {
                  trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_MORE_CLICKED, completionAnalyticsPayload);
                }
                onUploadMore();
              }}
            >
              {uploadFatalError ? t("startOver") : t("uploadMore")}
            </Button>
            {!uploadFatalError && hasUploadedTrees ? (
              <Button asChild>
                <Link
                  href={treeManagerHref}
                  onClick={() => trackTreeUploadEvent(TREE_UPLOAD_EVENTS.VIEW_TREES_CLICKED, completionAnalyticsPayload)}
                >
                  <DatabaseIcon />
                  {treeManagerLabel}
                </Link>
              </Button>
            ) : !uploadFatalError ? (
              <Button onClick={onDone}>{t("done")}</Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
