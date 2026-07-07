import { TREE_FUTURE_DATE_ERROR, isTreeDateInFuture } from "../../../../_lib/tree-date-validation";
import type {
  OccurrenceRecord,
  TreeMeasurementRecord,
  TreeMultimediaRecord,
} from "@/app/_lib/indexer";

const FLORA_MEASUREMENT_TYPE = "app.gainforest.dwc.measurement#floraMeasurement";

export const CANOPY_COVER_PERCENT_MAX = 100;

export type FloraMeasurement = {
  $type: typeof FLORA_MEASUREMENT_TYPE;
  dbh?: string;
  totalHeight?: string;
  basalDiameter?: string;
  canopyCoverPercent?: string;
  [key: string]: unknown;
};

export type TreeOccurrenceDraft = {
  scientificName: string;
  vernacularName: string;
  eventDate: string;
  recordedBy: string;
  locality: string;
  country: string;
  decimalLatitude: string;
  decimalLongitude: string;
  occurrenceRemarks: string;
  habitat: string;
  establishmentMeans: string;
};

export type TreeMeasurementDraft = {
  dbh: string;
  totalHeight: string;
  diameter: string;
  canopyCoverPercent: string;
};

export type TreeManagerItem = {
  occurrence: OccurrenceRecord;
  measurements: TreeMeasurementRecord[];
  bundledMeasurements: TreeMeasurementRecord[];
  preferredMeasurement: TreeMeasurementRecord | null;
  floraMeasurement: FloraMeasurement | null;
  photos: TreeMultimediaRecord[];
  hasLegacyMeasurements: boolean;
  hasUnsupportedMeasurements: boolean;
  hasDuplicateBundledMeasurements: boolean;
};

export type TreeDeletionTarget = {
  occurrenceRkey: string;
  occurrenceUri: string;
  measurementCount: number;
  photoCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseFloraMeasurement(value: unknown): FloraMeasurement | null {
  if (!isRecord(value)) return null;
  return value.$type === FLORA_MEASUREMENT_TYPE ? (value as FloraMeasurement) : null;
}

function groupMeasurementsByOccurrenceUri(
  measurements: TreeMeasurementRecord[],
): Map<string, TreeMeasurementRecord[]> {
  const grouped = new Map<string, TreeMeasurementRecord[]>();
  for (const measurement of measurements) {
    const occurrenceUri = measurement.record.occurrenceRef;
    if (!occurrenceUri) continue;
    const existing = grouped.get(occurrenceUri) ?? [];
    existing.push(measurement);
    grouped.set(occurrenceUri, existing);
  }
  return grouped;
}

function groupPhotosByOccurrenceUri(
  photos: TreeMultimediaRecord[],
): Map<string, TreeMultimediaRecord[]> {
  const grouped = new Map<string, TreeMultimediaRecord[]>();
  for (const photo of photos) {
    const occurrenceUri = photo.record.occurrenceRef;
    if (!occurrenceUri) continue;
    const existing = grouped.get(occurrenceUri) ?? [];
    existing.push(photo);
    grouped.set(occurrenceUri, existing);
  }
  return grouped;
}

export function buildTreeManagerItems(
  occurrences: OccurrenceRecord[],
  measurements: TreeMeasurementRecord[],
  photos: TreeMultimediaRecord[],
): TreeManagerItem[] {
  const measurementsByOccurrence = groupMeasurementsByOccurrenceUri(measurements);
  const photosByOccurrence = groupPhotosByOccurrenceUri(photos);

  return occurrences.flatMap((occurrence) => {
    const occurrenceUri = occurrence.atUri;
    if (!occurrenceUri) return [];
    const linkedMeasurements = measurementsByOccurrence.get(occurrenceUri) ?? [];
    const linkedPhotos = photosByOccurrence.get(occurrenceUri) ?? [];
    const bundledMeasurements = linkedMeasurements.filter((item) => parseFloraMeasurement(item.record.result));
    const preferredMeasurement = bundledMeasurements[0] ?? null;
    const floraMeasurement = preferredMeasurement ? parseFloraMeasurement(preferredMeasurement.record.result) : null;

    return [{
      occurrence,
      measurements: linkedMeasurements,
      bundledMeasurements,
      preferredMeasurement,
      floraMeasurement,
      photos: linkedPhotos,
      hasLegacyMeasurements: linkedMeasurements.some((item) => item.record.schemaVersion === "legacy"),
      hasUnsupportedMeasurements: linkedMeasurements.some((item) => {
        if (item.record.schemaVersion === "legacy") return false;
        return item.record.result !== null && parseFloraMeasurement(item.record.result) === null;
      }),
      hasDuplicateBundledMeasurements: bundledMeasurements.length > 1,
    }];
  });
}

export function getTreeDeletionTarget(item: TreeManagerItem): TreeDeletionTarget | null {
  const occurrenceRkey = nonEmptyString(item.occurrence.rkey);
  const occurrenceUri = nonEmptyString(item.occurrence.atUri);
  if (!occurrenceRkey || !occurrenceUri) return null;
  return {
    occurrenceRkey,
    occurrenceUri,
    measurementCount: item.measurements.length,
    photoCount: item.photos.length,
  };
}

export function getTreeOccurrenceDraft(occurrence: OccurrenceRecord): TreeOccurrenceDraft {
  return {
    scientificName: occurrence.scientificName ?? "",
    vernacularName: occurrence.vernacularName ?? "",
    eventDate: occurrence.eventDate ?? "",
    recordedBy: occurrence.recordedBy ?? "",
    locality: occurrence.locality ?? "",
    country: occurrence.country ?? "",
    decimalLatitude: occurrence.lat != null ? String(occurrence.lat) : "",
    decimalLongitude: occurrence.lon != null ? String(occurrence.lon) : "",
    occurrenceRemarks: occurrence.remarks ?? "",
    habitat: occurrence.habitat ?? "",
    establishmentMeans: occurrence.establishmentMeans ?? "",
  };
}

export function getTreeMeasurementDraft(floraMeasurement: FloraMeasurement | null): TreeMeasurementDraft {
  return {
    dbh: floraMeasurement?.dbh ?? "",
    totalHeight: floraMeasurement?.totalHeight ?? "",
    diameter: floraMeasurement?.basalDiameter ?? "",
    canopyCoverPercent: floraMeasurement?.canopyCoverPercent ?? "",
  };
}

export function formatTreeSubtitle(item: TreeManagerItem): string {
  const record = item.occurrence;
  if (record.locality && record.country) return `${record.locality}, ${record.country}`;
  return record.locality ?? record.country ?? "Location not set";
}

export function formatEventDate(value: string | null | undefined): string {
  if (!value) return "Date not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function getPhotoUrl(photo: TreeMultimediaRecord): string | null {
  if (photo.record.accessUri) return photo.record.accessUri;
  const file = photo.record.file;
  if (isRecord(file) && typeof file.uri === "string") return file.uri;
  return null;
}

export function hasAnyMeasurementValue(draft: TreeMeasurementDraft): boolean {
  return Object.values(draft).some((value) => value.trim().length > 0);
}

export function getClearedFloraMeasurementFields(draft: TreeMeasurementDraft): string[] {
  const cleared: string[] = [];
  if (!draft.dbh.trim()) cleared.push("dbh");
  if (!draft.totalHeight.trim()) cleared.push("totalHeight");
  if (!draft.diameter.trim()) cleared.push("basalDiameter");
  if (!draft.canopyCoverPercent.trim()) cleared.push("canopyCoverPercent");
  return cleared;
}

export function capCanopyCoverPercentInput(value: string): string {
  if (!value.trim()) return value;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > CANOPY_COVER_PERCENT_MAX
    ? String(CANOPY_COVER_PERCENT_MAX)
    : value;
}

export function toFloraMeasurementPayload(
  draft: TreeMeasurementDraft,
  options: { includeEmpty?: boolean } = {},
): FloraMeasurement | null {
  const payload: FloraMeasurement = { $type: FLORA_MEASUREMENT_TYPE };
  const dbh = draft.dbh.trim();
  const totalHeight = draft.totalHeight.trim();
  const diameter = draft.diameter.trim();
  const canopyCoverPercent = draft.canopyCoverPercent.trim();
  if (dbh) payload.dbh = dbh;
  if (totalHeight) payload.totalHeight = totalHeight;
  if (diameter) payload.basalDiameter = diameter;
  if (canopyCoverPercent) payload.canopyCoverPercent = canopyCoverPercent;
  return Object.keys(payload).length > 1 || options.includeEmpty ? payload : null;
}

export function validateOccurrenceDraft(draft: TreeOccurrenceDraft): string | null {
  if (!draft.scientificName.trim()) return "Scientific name is required.";
  if (!draft.eventDate.trim()) return "Event date is required.";
  if (isTreeDateInFuture(draft.eventDate)) return TREE_FUTURE_DATE_ERROR;
  if (!draft.decimalLatitude.trim()) return "Latitude is required.";
  if (!draft.decimalLongitude.trim()) return "Longitude is required.";

  const latitude = Number(draft.decimalLatitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be a number between -90 and 90.";
  }

  const longitude = Number(draft.decimalLongitude);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be a number between -180 and 180.";
  }

  return null;
}

export function validateMeasurementDraft(draft: TreeMeasurementDraft): string | null {
  const fields: Array<{ label: string; value: string; min?: number; minExclusive?: boolean; max?: number }> = [
    { label: "DBH", value: draft.dbh, min: 0, minExclusive: true },
    { label: "Height", value: draft.totalHeight, min: 0, minExclusive: true },
    { label: "Root collar diameter", value: draft.diameter, min: 0, minExclusive: true },
    { label: "Canopy cover", value: draft.canopyCoverPercent, min: 0, max: CANOPY_COVER_PERCENT_MAX },
  ];

  for (const field of fields) {
    const trimmed = field.value.trim();
    if (!trimmed) continue;
    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) return `${field.label} must be a valid number.`;
    if (field.min !== undefined && field.minExclusive && numericValue <= field.min) {
      return `${field.label} must be positive.`;
    }
    if (field.min !== undefined && !field.minExclusive && numericValue < field.min) {
      return `${field.label} must be at least ${field.min}.`;
    }
    if (field.max !== undefined && numericValue > field.max) {
      return `${field.label} must be ${field.max} or less.`;
    }
  }

  return null;
}

export function isDraftEqual<T extends Record<string, string>>(left: T, right: T): boolean {
  const keys = Object.keys(left) as Array<keyof T>;
  return keys.every((key) => left[key] === right[key]);
}
