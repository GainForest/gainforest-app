import { z } from "zod";
import type {
  ColumnMapping,
  FloraMeasurementBundle,
  OccurrenceInput,
  PhotoEntry,
  RowError,
  ValidatedRow,
  ValidationResult,
} from "./types";
import { inferSubjectPartFromColumnName } from "./column-mapper";
import { resolveKoboMediaZipEntry, type KoboMediaZipIndex } from "./kobo-media-zip";
import {
  formatBoundaryDistance,
  getTreeBoundaryFailure,
  TREE_SITE_NEAR_BOUNDARY_METERS,
  type SiteBoundaryGeoJson,
} from "./site-boundary";

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{4}$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
];

function isValidDate(value: string): boolean {
  return DATE_PATTERNS.some((p) => p.test(value));
}

const OccurrenceRowSchema = z.object({
  scientificName: z.string().min(1, "Scientific name is required"),
  eventDate: z
    .string()
    .min(1, "Event date is required")
    .refine(isValidDate, { message: "Date must be in ISO 8601 or common format (YYYY-MM-DD, MM/DD/YYYY, YYYY)" }),
  decimalLatitude: z.coerce.number().min(-90).max(90),
  decimalLongitude: z.coerce.number().min(-180).max(180),
  basisOfRecord: z.string().optional().default("HumanObservation"),
  vernacularName: z.string().optional(),
  recordedBy: z.string().optional(),
  locality: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  occurrenceRemarks: z.string().optional(),
  habitat: z.string().optional(),
  samplingProtocol: z.string().optional(),
  kingdom: z.string().optional(),
});

const MeasurementFields = {
  height: z.coerce.number().positive("Measurement must be positive").optional(),
  totalHeight: z.coerce.number().positive("Measurement must be positive").optional(),
  dbh: z.coerce.number().positive("Measurement must be positive").optional(),
  diameter: z.coerce.number().positive("Measurement must be positive").optional(),
  canopyCoverPercent: z.coerce.number().min(0).max(100).optional(),
  canopyCover: z.coerce.number().min(0).max(100).optional(),
};

const TreeRowSchema = OccurrenceRowSchema.merge(z.object(MeasurementFields));
type TreeRowOutput = z.output<typeof TreeRowSchema>;

function extractFloraMeasurement(row: TreeRowOutput): FloraMeasurementBundle | null {
  const bundle: FloraMeasurementBundle = {};
  const totalHeight = row.height ?? row.totalHeight;
  const canopyCoverPercent = row.canopyCoverPercent ?? row.canopyCover;
  if (totalHeight !== undefined) bundle.totalHeight = String(totalHeight);
  if (row.dbh !== undefined) bundle.dbh = String(row.dbh);
  if (row.diameter !== undefined) bundle.diameter = String(row.diameter);
  if (canopyCoverPercent !== undefined) bundle.canopyCoverPercent = String(canopyCoverPercent);
  const hasAny = bundle.totalHeight !== undefined || bundle.dbh !== undefined ||
    bundle.diameter !== undefined || bundle.canopyCoverPercent !== undefined;
  return hasAny ? bundle : null;
}

function extractOccurrence(row: TreeRowOutput, siteRef?: string): OccurrenceInput {
  return {
    scientificName: row.scientificName,
    eventDate: row.eventDate,
    decimalLatitude: row.decimalLatitude,
    decimalLongitude: row.decimalLongitude,
    basisOfRecord: row.basisOfRecord,
    vernacularName: row.vernacularName,
    recordedBy: row.recordedBy,
    locality: row.locality,
    country: row.country,
    countryCode: row.countryCode,
    occurrenceRemarks: row.occurrenceRemarks,
    habitat: row.habitat,
    samplingProtocol: row.samplingProtocol,
    kingdom: row.kingdom,
    siteRef,
  };
}

function getBoundaryIssue(row: TreeRowOutput, index: number, boundary: SiteBoundaryGeoJson) {
  const failure = getTreeBoundaryFailure({
    tree: { index, scientificName: row.scientificName, decimalLatitude: row.decimalLatitude, decimalLongitude: row.decimalLongitude },
    boundary,
    nearBoundaryMeters: TREE_SITE_NEAR_BOUNDARY_METERS,
  });
  if (!failure) return null;
  if (failure.kind === "near-boundary") {
    return { path: "siteBoundary", message: `This tree is ${formatBoundaryDistance(failure.distanceMeters)} outside the selected drawn map area. Check the coordinates, choose a different site boundary, or remove this row.` };
  }
  if (failure.kind === "invalid-boundary") {
    return { path: "siteBoundary", message: `The selected drawn map area cannot be used. ${failure.reason ?? "Choose or draw another site boundary."}` };
  }
  return { path: "siteBoundary", message: `This tree is ${formatBoundaryDistance(failure.distanceMeters)} outside the selected drawn map area. Check the coordinates, choose a different site boundary, or remove this row.` };
}

function splitPhotoUrls(value: string): string[] {
  return value.split(/[,;]/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function getPhotoUrlFallback(
  rawRow: Record<string, string>,
  sourceColumn: string,
): string | null {
  const companionColumn = `${sourceColumn}_url`.toLowerCase();

  for (const [columnName, value] of Object.entries(rawRow)) {
    if (columnName.toLowerCase() !== companionColumn) continue;

    const fallbackValue = value.trim();
    if (fallbackValue && isLikelyUrl(fallbackValue)) return fallbackValue;
  }

  return null;
}

function extractPhotos(
  rawRow: Record<string, string>,
  photoMappings: { sourceColumn: string; subjectPart: string }[],
  koboMediaZipIndex: KoboMediaZipIndex | null,
): PhotoEntry[] {
  const photos: PhotoEntry[] = [];
  for (const { sourceColumn, subjectPart } of photoMappings) {
    const cellValue = rawRow[sourceColumn];
    if (!cellValue || cellValue.trim() === "") continue;
    const urls = splitPhotoUrls(cellValue);
    const fallbackUrl = getPhotoUrlFallback(rawRow, sourceColumn);
    let usedFallbackUrl = false;

    for (const value of urls) {
      if (koboMediaZipIndex) {
        const zipEntry = resolveKoboMediaZipEntry(koboMediaZipIndex, rawRow, value);
        if (zipEntry) {
          photos.push({ source: "koboZip", entryPath: zipEntry.entryPath, fileName: zipEntry.fileName, mimeType: zipEntry.mimeType, subjectPart });
          continue;
        }
      }
      if (isLikelyUrl(value)) {
        photos.push({ source: "url", url: value, subjectPart });
        continue;
      }
      if (fallbackUrl && !usedFallbackUrl) {
        photos.push({ source: "url", url: fallbackUrl, subjectPart });
        usedFallbackUrl = true;
      }
    }
  }
  return photos;
}

export function parseAndValidateRows(
  rows: Record<string, string>[],
  rawRows?: Record<string, string>[],
  mappings?: ColumnMapping[],
  options?: {
    koboMediaZipIndex?: KoboMediaZipIndex | null;
    siteBoundary?: { geoJson: SiteBoundaryGeoJson; siteRef: string } | null;
  },
): ValidationResult {
  const valid: ValidatedRow[] = [];
  const errors: RowError[] = [];

  const photoMappings = (mappings ?? [])
    .filter((m) => m.targetField === "photoUrl")
    .map((m) => ({ sourceColumn: m.sourceColumn, subjectPart: inferSubjectPartFromColumnName(m.sourceColumn) }));

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] as unknown;
    const result = TreeRowSchema.safeParse(row);
    if (result.success) {
      const boundaryIssue = options?.siteBoundary
        ? getBoundaryIssue(result.data, index, options.siteBoundary.geoJson)
        : null;
      if (boundaryIssue) {
        errors.push({ index, issues: [boundaryIssue] });
        continue;
      }
      const occurrence = extractOccurrence(result.data, options?.siteBoundary?.siteRef);
      const floraMeasurement = extractFloraMeasurement(result.data);
      const validatedRow: ValidatedRow = { index, occurrence, floraMeasurement };
      if (rawRows && photoMappings.length > 0) {
        const rawRow = rawRows[index];
        if (rawRow) {
          const photos = extractPhotos(rawRow, photoMappings, options?.koboMediaZipIndex ?? null);
          if (photos.length > 0) validatedRow.photos = photos;
        }
      }
      valid.push(validatedRow);
    } else {
      const issues = result.error.issues.map((issue) => ({ path: issue.path.join(".") || "root", message: issue.message }));
      errors.push({ index, issues });
    }
  }

  return { valid, errors };
}
