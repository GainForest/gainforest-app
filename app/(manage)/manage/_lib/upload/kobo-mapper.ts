import type { ColumnMapping } from "./types";

/**
 * Known KoboToolbox field patterns mapped to Darwin Core target fields.
 *
 * isGpsCombined = true means the source column holds a combined
 * "lat lon alt accuracy" string that must be split into two mappings.
 *
 * koboSpecific = true means this pattern is a strong indicator of a
 * KoboToolbox export (not a generic field name that appears in any CSV).
 * At least one koboSpecific match is required for detectKoboFormat to
 * return isKobo=true, preventing false positives on standard Darwin Core
 * headers like eventDate (contains "date") or decimalLatitude (contains
 * "latitude").
 */
type KoboPattern = {
  pattern: string;
  targetField: string;
  /** If true, this column contains combined GPS data (lat lon alt accuracy) */
  gpsCombined?: boolean;
  /** If true, this pattern is a strong KoboToolbox-specific indicator */
  koboSpecific?: boolean;
};

const MULTI_MAP_TARGETS = new Set(["photoUrl"]);
const KOBO_METADATA_COLUMNS = new Set([
  "_id",
  "_uuid",
  "_submission_time",
  "_validation_status",
  "_notes",
  "_status",
  "_submitted_by",
  "__version__",
  "_tags",
  "meta/rootUuid",
  "_index",
]);

function isCrownOrCanopyDiameterHeader(header: string): boolean {
  const normalizedHeader = header.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const tokens = normalizedHeader
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
  const compactHeader = tokens.join("");
  const mentionsCrownOrCanopy =
    tokens.includes("crown") ||
    tokens.includes("canopy") ||
    compactHeader.includes("crown") ||
    compactHeader.includes("canopy");
  const mentionsDiameter =
    tokens.some(
      (token) =>
        token === "diameter" || token === "diam" || token === "dia"
    ) ||
    compactHeader.includes("diameter") ||
    /(diam|dia)(cm|mm|m)?$/.test(compactHeader);

  return mentionsCrownOrCanopy && mentionsDiameter;
}

function normalizeKoboHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isCombinedGpsHeader(header: string): boolean {
  const normalized = normalizeKoboHeader(header);
  const tokens = normalized.split("_").filter((token) => token.length > 0);
  const mentionsGps = tokens.includes("gps") || tokens.includes("geopoint");
  const mentionsGpsComponent = tokens.some((token) =>
    ["latitude", "longitude", "altitude", "precision", "accuracy"].includes(
      token,
    ),
  );

  return mentionsGps && !mentionsGpsComponent;
}

function isExplicitLatitudeHeader(header: string): boolean {
  const normalized = normalizeKoboHeader(header);
  return normalized.includes("latitude") || normalized.endsWith("_lat");
}

function isExplicitLongitudeHeader(header: string): boolean {
  const normalized = normalizeKoboHeader(header);
  return normalized.includes("longitude") || normalized.endsWith("_lon") || normalized.endsWith("_lng");
}

function hasExplicitCoordinateColumns(headers: string[]): boolean {
  return (
    headers.some(isExplicitLatitudeHeader) &&
    headers.some(isExplicitLongitudeHeader)
  );
}

const KOBO_PATTERNS: KoboPattern[] = [
  // Combined GPS field — handled specially: produces TWO mappings
  // koboSpecific: these combined GPS fields are unique to KoboToolbox exports
  { pattern: "gps", targetField: "decimalLatitude", gpsCombined: true, koboSpecific: true },
  { pattern: "geopoint", targetField: "decimalLatitude", gpsCombined: true, koboSpecific: true },

  // Explicit latitude fields
  // koboSpecific: prefixed GPS fields are KoboToolbox-specific
  { pattern: "_gps_latitude", targetField: "decimalLatitude", koboSpecific: true },
  { pattern: "gps_latitude", targetField: "decimalLatitude", koboSpecific: true },
  // generic: "latitude" also appears in standard CSVs
  { pattern: "latitude", targetField: "decimalLatitude" },

  // Explicit longitude fields
  // koboSpecific: prefixed GPS fields are KoboToolbox-specific
  { pattern: "_gps_longitude", targetField: "decimalLongitude", koboSpecific: true },
  { pattern: "gps_longitude", targetField: "decimalLongitude", koboSpecific: true },
  // generic: "longitude" also appears in standard CSVs
  { pattern: "longitude", targetField: "decimalLongitude" },

  // Scientific name
  // koboSpecific: plant_name is KoboToolbox's species field
  { pattern: "plant_name", targetField: "scientificName", koboSpecific: true },
  // generic: species / scientific_name appear in any tree CSV
  { pattern: "species", targetField: "scientificName" },
  { pattern: "scientific_name", targetField: "scientificName" },

  // Measurements
  { pattern: "dbh", targetField: "dbh" },
  { pattern: "diameter_breast_height", targetField: "dbh" },
  { pattern: "height", targetField: "height" },
  { pattern: "tree_height", targetField: "height" },
  { pattern: "diameter", targetField: "diameter" },
  { pattern: "canopycoverpercent", targetField: "canopyCoverPercent" },
  { pattern: "canopy_cover_percent", targetField: "canopyCoverPercent" },
  { pattern: "canopy_cover_pct", targetField: "canopyCoverPercent" },
  { pattern: "canopy_cover", targetField: "canopyCoverPercent" },

  // Date / time — explicit date fields take priority over submission_time
  // koboSpecific: FCD tree time field is KoboToolbox-specific
  { pattern: "fcd-tree_records-tree_time", targetField: "eventDate", koboSpecific: true },
  // generic: "date" also appears in standard CSVs (e.g. eventDate contains "date")
  { pattern: "date", targetField: "eventDate" },
  { pattern: "observation_date", targetField: "eventDate" },
  { pattern: "survey_date", targetField: "eventDate" },
  // koboSpecific: submission_time is KoboToolbox metadata
  { pattern: "_submission_time", targetField: "eventDate", koboSpecific: true },
  { pattern: "submission_time", targetField: "eventDate", koboSpecific: true },

  // Observer
  { pattern: "recorder", targetField: "recordedBy" },
  { pattern: "recorded_by", targetField: "recordedBy" },
  { pattern: "observer", targetField: "recordedBy" },

  // Location
  { pattern: "site", targetField: "locality" },
  { pattern: "locality", targetField: "locality" },
  { pattern: "location", targetField: "locality" },
  { pattern: "country", targetField: "country" },

  // Remarks / notes
  { pattern: "notes", targetField: "occurrenceRemarks" },
  { pattern: "remarks", targetField: "occurrenceRemarks" },
  { pattern: "comments", targetField: "occurrenceRemarks" },

  // Common name
  { pattern: "common_name", targetField: "vernacularName" },
  { pattern: "vernacular_name", targetField: "vernacularName" },
  { pattern: "local_name", targetField: "vernacularName" },

  // Habitat
  { pattern: "habitat", targetField: "habitat" },

  // Photo / media
  // koboSpecific: _attachments is a KoboToolbox metadata field containing URLs
  { pattern: "_attachments", targetField: "photoUrl", koboSpecific: true },
  { pattern: "photo", targetField: "photoUrl" },
  { pattern: "image", targetField: "photoUrl" },
  { pattern: "picture", targetField: "photoUrl" },
  { pattern: "attachment_url", targetField: "photoUrl" },
];

/**
 * Match a single header against the known Kobo patterns (case-insensitive).
 * Returns the first matching pattern entry, or null if none match.
 *
 * Matching strategy:
 *   1. First pass: exact match only (lower === entry.pattern)
 *   2. Second pass: substring match (lower.includes(entry.pattern)),
 *      but gpsCombined patterns are SKIPPED in this pass so that a
 *      column like "_GPS_longitude" (which contains "gps") is not
 *      incorrectly matched by the combined-GPS pattern when a more
 *      specific exact pattern already exists.
 */
function matchPattern(header: string): KoboPattern | null {
  const lower = header.toLowerCase();
  const normalized = normalizeKoboHeader(header);
  const isCrownOrCanopyDiameter = isCrownOrCanopyDiameterHeader(header);
  const isCombinedGps = isCombinedGpsHeader(header);

  // Pass 1: exact match
  for (const entry of KOBO_PATTERNS) {
    if (lower === entry.pattern || normalized === entry.pattern) {
      return entry;
    }
  }

  // Pass 2: substring match — skip gpsCombined patterns to prevent
  // "_gps_longitude".includes("gps") from firing the combined-GPS handler
  for (const entry of KOBO_PATTERNS) {
    if (isCombinedGps && entry.targetField === "locality") {
      continue;
    }

    if (
      isCrownOrCanopyDiameter &&
      (entry.pattern === "diameter" ||
        entry.targetField === "canopyCoverPercent")
    ) {
      continue;
    }

    if (
      !entry.gpsCombined &&
      (lower.includes(entry.pattern) || normalized.includes(entry.pattern))
    ) {
      return entry;
    }
  }

  // Pass 3: substring match for gpsCombined patterns (only reached when no
  // specific pattern matched above, i.e. the column is genuinely a combined
  // GPS field like "GPS" or "geopoint")
  for (const entry of KOBO_PATTERNS) {
    if (
      entry.gpsCombined &&
      (lower.includes(entry.pattern) || normalized.includes(entry.pattern))
    ) {
      return entry;
    }
  }

  return null;
}

export function isKoboPhotoUrlCompanionColumn(
  header: string,
  allHeaders: string[],
): boolean {
  const baseHeader = header.replace(/_url$/i, "");
  if (baseHeader === header) {
    return false;
  }

  const basePattern = matchPattern(baseHeader);
  return (
    basePattern?.targetField === "photoUrl" &&
    allHeaders.some((candidate) => candidate === baseHeader)
  );
}

export function isExpectedSkippedKoboColumn(
  header: string,
  allHeaders: string[],
): boolean {
  if (KOBO_METADATA_COLUMNS.has(header)) {
    return true;
  }

  const normalized = normalizeKoboHeader(header);
  if (
    normalized.endsWith("_altitude") ||
    normalized.endsWith("_precision") ||
    normalized.endsWith("_accuracy")
  ) {
    return true;
  }

  if (isKoboPhotoUrlCompanionColumn(header, allHeaders)) {
    return true;
  }

  return isCombinedGpsHeader(header) && hasExplicitCoordinateColumns(allHeaders);
}

/**
 * Build ColumnMapping(s) for a single header.
 *
 * For combined GPS fields (e.g. "GPS", "geopoint") that contain
 * "lat lon alt accuracy", two mappings are returned:
 *   - one for decimalLatitude  (transform: split by space, take index 0)
 *   - one for decimalLongitude (transform: split by space, take index 1)
 *
 * For all other fields, a single mapping is returned (no transform unless
 * the field is an explicit lat/lon field that doesn't need splitting).
 */
function buildMappings(header: string, pattern: KoboPattern): ColumnMapping[] {
  if (pattern.gpsCombined) {
    const latMapping: ColumnMapping = {
      sourceColumn: header,
      targetField: "decimalLatitude",
      transform: (value: string) => value.trim().split(/\s+/)[0] ?? "",
    };
    const lonMapping: ColumnMapping = {
      sourceColumn: header,
      targetField: "decimalLongitude",
      transform: (value: string) => value.trim().split(/\s+/)[1] ?? "",
    };
    return [latMapping, lonMapping];
  }

  return [{ sourceColumn: header, targetField: pattern.targetField }];
}

/**
 * Returns mappings for all headers that match known Kobo patterns.
 * Unrecognized headers are not included.
 *
 * When multiple headers would map to the same target field, only the
 * first match (in header order) is kept to avoid duplicate mappings.
 * Photo URL is the exception: Kobo tree forms commonly export Whole Tree,
 * Leaf, and Bark photo filename columns, and all three should be uploaded.
 */
export function getKoboColumnMappings(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedTargets = new Set<string>();

  for (const header of headers) {
    const normalizedHeader = normalizeKoboHeader(header);
    if (
      (isCombinedGpsHeader(header) && hasExplicitCoordinateColumns(headers)) ||
      normalizedHeader.endsWith("_altitude") ||
      normalizedHeader.endsWith("_precision") ||
      normalizedHeader.endsWith("_accuracy")
    ) {
      continue;
    }

    if (isKoboPhotoUrlCompanionColumn(header, headers)) {
      continue;
    }

    const pattern = matchPattern(header);
    if (!pattern) continue;

    const candidates = buildMappings(header, pattern);
    for (const mapping of candidates) {
      const isMultiMap = MULTI_MAP_TARGETS.has(mapping.targetField);
      if (isMultiMap || !usedTargets.has(mapping.targetField)) {
        mappings.push(mapping);
        if (!isMultiMap) {
          usedTargets.add(mapping.targetField);
        }
      }
    }
  }

  return mappings;
}

/**
 * Auto-detect whether a set of CSV headers looks like a KoboToolbox export.
 *
 * Returns:
 *   - isKobo: true when confidence >= 0.3 AND at least one koboSpecific pattern matched
 *   - confidence: 0–1 = matched headers / total headers
 *   - mappings: all recognized column mappings (via getKoboColumnMappings)
 *
 * The strongMatchCount guard prevents false positives on standard Darwin Core
 * headers (e.g. eventDate contains "date", decimalLatitude contains "latitude")
 * which would otherwise push confidence above 0.3 without any genuine Kobo signal.
 */
export function detectKoboFormat(headers: string[]): {
  isKobo: boolean;
  confidence: number;
  mappings: ColumnMapping[];
} {
  if (headers.length === 0) {
    return { isKobo: false, confidence: 0, mappings: [] };
  }

  // Count how many headers match at least one Kobo pattern
  let matchedCount = 0;
  let strongMatchCount = 0;
  for (const header of headers) {
    const pattern = matchPattern(header);
    if (pattern !== null) {
      matchedCount++;
      if (pattern.koboSpecific) {
        strongMatchCount++;
      }
    }
  }

  const confidence = matchedCount / headers.length;
  // Require both a minimum confidence AND at least one KoboToolbox-specific indicator
  const isKobo = confidence >= 0.3 && strongMatchCount >= 1;
  const mappings = getKoboColumnMappings(headers);

  return { isKobo, confidence, mappings };
}
