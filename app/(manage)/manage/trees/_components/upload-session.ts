import type {
  FloraMeasurementBundle,
  OccurrenceInput,
  PhotoEntry,
  TreeUploadRowAttentionKind,
  TreeUploadRowAttentionSummary,
  ValidatedRow,
} from "../../_lib/upload/types";
import {
  NO_UPLOAD_DATASET_SELECTION,
  isUploadDatasetSelection,
  type UploadDatasetSelection,
} from "../../_lib/upload/upload-dataset-selection";
import {
  isUploadSiteSelection,
  uploadSiteHasBoundary,
  type UploadSiteSelection,
} from "../../_lib/upload/site-selection";

const STORAGE_KEY = "manage-trees-pending";
const SESSION_TTL_MS = 10 * 60 * 1000;

export type PendingUploadData = {
  ownerDid: string;
  uploadId?: string;
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return typeof value === "string" || typeof value === "undefined";
}

function isAtUri(value: unknown): value is string {
  return typeof value === "string" && /^at:\/\/[^/]+\/[^/]+\/[^/]+$/.test(value);
}

function isOptionalAtUri(value: unknown): value is string | undefined {
  return typeof value === "undefined" || isAtUri(value);
}

function isTreeUploadRowAttentionKind(value: unknown): value is TreeUploadRowAttentionKind {
  return value === "skipped" || value === "failed" || value === "partial";
}

function isOccurrenceInput(value: unknown): value is OccurrenceInput {
  if (!isRecord(value)) return false;
  return (
    typeof value.scientificName === "string" &&
    typeof value.eventDate === "string" &&
    typeof value.decimalLatitude === "number" &&
    Number.isFinite(value.decimalLatitude) &&
    typeof value.decimalLongitude === "number" &&
    Number.isFinite(value.decimalLongitude) &&
    isOptionalString(value.basisOfRecord) &&
    isOptionalString(value.vernacularName) &&
    isOptionalString(value.recordedBy) &&
    isOptionalString(value.locality) &&
    isOptionalString(value.country) &&
    isOptionalString(value.occurrenceRemarks) &&
    isOptionalString(value.habitat) &&
    isOptionalAtUri(value.siteRef) &&
    isOptionalString(value.establishmentMeans) &&
    isOptionalAtUri(value.datasetRef) &&
    isOptionalString(value.dynamicProperties)
  );
}

function isFloraMeasurementBundle(value: unknown): value is FloraMeasurementBundle {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.dbh) &&
    isOptionalString(value.totalHeight) &&
    isOptionalString(value.diameter) &&
    isOptionalString(value.canopyCoverPercent)
  );
}

function isPhotoEntry(value: unknown): value is PhotoEntry {
  if (!isRecord(value) || typeof value.subjectPart !== "string") return false;
  if (value.source === "url") return typeof value.url === "string";
  if (value.source === "koboZip") {
    return (
      typeof value.entryPath === "string" &&
      typeof value.fileName === "string" &&
      typeof value.mimeType === "string"
    );
  }
  return false;
}

function isValidatedRow(value: unknown): value is ValidatedRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    isOccurrenceInput(value.occurrence) &&
    (value.floraMeasurement === null || isFloraMeasurementBundle(value.floraMeasurement)) &&
    (typeof value.photos === "undefined" ||
      (Array.isArray(value.photos) && value.photos.every(isPhotoEntry)))
  );
}

function isTreeUploadRowAttentionSummary(value: unknown): value is TreeUploadRowAttentionSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.sourceRowIndex === "number" &&
    typeof value.rowLabel === "string" &&
    Array.isArray(value.messages) &&
    value.messages.every((m) => typeof m === "string") &&
    isTreeUploadRowAttentionKind(value.kind)
  );
}

function isPendingCandidate(value: unknown): value is PendingUploadData {
  if (!isRecord(value)) return false;
  if (
    typeof value.ownerDid !== "string" ||
    !Array.isArray(value.validRows) ||
    !value.validRows.every(isValidatedRow) ||
    (typeof value.previewSkippedRows !== "undefined" &&
      (!Array.isArray(value.previewSkippedRows) ||
        !value.previewSkippedRows.every(isTreeUploadRowAttentionSummary))) ||
    !isUploadSiteSelection(value.siteSelection) ||
    !uploadSiteHasBoundary(value.siteSelection as UploadSiteSelection) ||
    typeof value.timestamp !== "number"
  ) {
    return false;
  }
  return true;
}

export function readPendingUpload(ownerDid: string): PendingUploadData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPendingCandidate(parsed)) { clearPendingUpload(); return null; }
    if (parsed.ownerDid !== ownerDid) return null;
    if (Date.now() - parsed.timestamp > SESSION_TTL_MS) { clearPendingUpload(); return null; }
    return {
      ownerDid: parsed.ownerDid,
      uploadId: typeof parsed.uploadId === "string" ? parsed.uploadId : undefined,
      validRows: parsed.validRows,
      previewSkippedRows: Array.isArray(parsed.previewSkippedRows) ? parsed.previewSkippedRows : [],
      establishmentMeans:
        typeof parsed.establishmentMeans === "string" || parsed.establishmentMeans === null
          ? parsed.establishmentMeans
          : null,
      datasetSelection: isUploadDatasetSelection(parsed.datasetSelection)
        ? parsed.datasetSelection
        : NO_UPLOAD_DATASET_SELECTION,
      siteSelection: parsed.siteSelection as UploadSiteSelection,
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export function persistPendingUpload(data: Omit<PendingUploadData, "timestamp">): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...data, timestamp: Date.now() }),
  );
}

export function clearPendingUpload(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}


