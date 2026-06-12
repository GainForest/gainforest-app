"use client";

import Link from "next/link";
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
  target: ManageTarget;
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  koboMediaZipFile: File | null;
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection | null;
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

const EXISTING_TREE_GROUP_UNAVAILABLE_MESSAGE =
  "The selected tree group disappeared during upload. Remaining rows were not added.";
const UNCONFIRMED_TREE_GROUP_CHUNK_MESSAGE =
  "This group of trees could not be confirmed. Some trees may already be saved; review your trees before retrying.";

function isTreeGroupUnavailableMessage(message: string): boolean {
  return message.toLowerCase().includes("tree group") && (
    message.toLowerCase().includes("no longer available") ||
    message.toLowerCase().includes("disappeared")
  );
}

function plainSaveErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  if (
    message.includes("tree group") ||
    message.includes("Tree group") ||
    message.includes("Tree information") ||
    message.includes("Measurement") ||
    message.includes("could not be saved") ||
    message.includes("could not be updated")
  ) {
    return message;
  }
  return fallback;
}

function photoErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (
    message.startsWith("Photo ") ||
    message.startsWith("This photo") ||
    message.startsWith("Could not open this photo link") ||
    message.startsWith("Photo link") ||
    message.startsWith("The photo") ||
    message.startsWith("The selected photo folder") ||
    message.startsWith("The photo folder")
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
  target,
  validRows,
  previewSkippedRows,
  koboMediaZipFile,
  establishmentMeans,
  datasetSelection,
  siteSelection,
  backLabel,
  onBack,
  onUploadMore,
  onDone,
}: UploadStepProps) {
  const { pushModal, show } = useModal();
  const writeOptions = target.kind === "group" ? { repo: target.did } : undefined;
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
      setUploadFatalError("No site selected. Go back and choose or create a site boundary.");
      setClockMs(completedAtMs);
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
      setUploadFatalError("Could not check the selected drawn map area. Go back, choose or create a site boundary, then try again.");
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
      setUploadFatalError(
        "This upload includes photos from a photo folder, but that folder cannot be restored after refreshing or signing in again. Start over and select both the tree file and matching photo folder.",
      );
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
        setUploadFatalError("Could not create the tree group. Try again or continue without a group.");
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

          const baseError = "The selected tree group disappeared during upload, so this tree was kept without that group. Review this tree before retrying.";
          const fallbackError = "The selected tree group disappeared during upload and this tree could not be moved out of that group automatically. Review this tree before retrying.";
          const nextBaseError = status.state === "partial" ? `${status.error} ${baseError}` : baseError;
          const nextFallbackError = status.state === "partial" ? `${status.error} ${fallbackError}` : fallbackError;
          const rkey = getOccurrenceRkey(status);

          if (!rkey) {
            if (status.state === "success") demotedSuccesses += 1;
            statuses[index] = { state: "partial", occurrenceUri: status.occurrenceUri, photoCount: status.photoCount, error: nextFallbackError };
            continue;
          }

          try {
            await detachOccurrenceFromDataset(rkey);
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
          ? (chunkEntries[0]?.row.occurrence.scientificName || `Row ${(chunkEntries[0]?.rowIndex ?? chunkStart) + 1}`)
          : `Rows ${chunkStart + 1}-${chunkEnd} of ${rowsToUpload.length}`;

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
          });
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
              nextStatuses[globalIndex] = { state: "partial", occurrenceUri: result.occurrenceUri, photoCount: result.photoCount, error: result.error };
              continue;
            }

            failures += 1;
            nextStatuses[globalIndex] = { state: "error", error: result.error };
          }

          for (const [chunkIndex] of chunkRows.entries()) {
            const entry = chunkEntries[chunkIndex];
            if (!entry || handledIndexes.has(chunkIndex)) continue;

            failures += 1;
            nextStatuses[entry.rowIndex] = { state: "error", error: "Unexpected save response for this row." };
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

              nextStatuses[remainingEntry.rowIndex] = { state: "error", error: EXISTING_TREE_GROUP_UNAVAILABLE_MESSAGE };
              failures += 1;
            }
            stopExistingTreeGroupUpload = true;
          }
        } catch (error) {
          const baseMessage = plainSaveErrorMessage(error, "Trees could not be saved.");
          const treeGroupUnavailable = isTreeGroupUnavailableMessage(baseMessage);
          const chunkMessage = treeGroupUnavailable
            ? EXISTING_TREE_GROUP_UNAVAILABLE_MESSAGE
            : `${baseMessage} ${UNCONFIRMED_TREE_GROUP_CHUNK_MESSAGE}`;

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
                    error: "The tree was saved, but its measurement could not be saved and automatic cleanup could not finish. Review this tree before retrying.",
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
          next[rowIndex] = { state: "error", error: plainSaveErrorMessage(err, "Tree could not be saved.") };
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
        setDatasetUpdateWarning("The empty tree group could not be removed automatically.");
      }
    } else if (datasetSelection.mode === "new" && datasetRkey && persistedOccurrences > 0) {
      try {
        await incrementDatasetRecordCount(datasetRkey, persistedOccurrences);
      } catch {
        setDatasetUpdateWarning("Tree group created, but its tree count could not be updated.");
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
  }, [datasetSelection, establishmentMeans, koboMediaZipFile, photoFetchQueue.length, previewSkippedRows.length, siteSelection, uploadId, validRows]);

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
  }, [datasetSelection.mode, koboMediaZipFile, photoFetchQueue, rowStatuses, siteSelection?.uri, uploadId, validRows.length]);

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
    unitLabel: "photo",
  });

  const sourceTotalCount = uploadTotal + previewSkippedRows.length;
  const treeManagerHref = links.manage.target.trees(target, { dataset: uploadedDatasetUri });
  const treeManagerLabel = uploadedDatasetUri ? "View tree group" : "View trees";
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
            <Button
              variant="outline"
              onClick={() => {
                if (!uploadFatalError) {
                  trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_MORE_CLICKED, completionAnalyticsPayload);
                }
                onUploadMore();
              }}
            >
              {uploadFatalError ? "Start over" : "Upload more trees"}
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
              <Button onClick={onDone}>Done</Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
