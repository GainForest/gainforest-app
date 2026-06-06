import type { ColumnMapping, MappedRow } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Subject part detection from column names
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECT_PART_KEYWORDS: { keywords: string[]; subjectPart: string }[] = [
  { keywords: ["leaf", "leaves", "foliage"], subjectPart: "leaf" },
  { keywords: ["bark"], subjectPart: "bark" },
  { keywords: ["flower", "bloom", "blossom"], subjectPart: "flower" },
  { keywords: ["fruit"], subjectPart: "fruit" },
  { keywords: ["seed"], subjectPart: "seed" },
  { keywords: ["stem", "trunk"], subjectPart: "stem" },
  { keywords: ["twig", "branch"], subjectPart: "twig" },
  { keywords: ["bud"], subjectPart: "bud" },
  { keywords: ["root"], subjectPart: "root" },
];

/**
 * Infer the subject part from a column header name.
 *
 * Looks for subject-part keywords in the header (e.g., "photo_leaf" → "leaf",
 * "bark_image" → "bark"). Falls back to "entireOrganism" when no keyword matches.
 */
export function inferSubjectPartFromColumnName(header: string): string {
  const normalized = header.toLowerCase().replace(/[^a-z]/g, " ");

  for (const { keywords, subjectPart } of SUBJECT_PART_KEYWORDS) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return subjectPart;
      }
    }
  }

  return "entireOrganism";
}

/** Target fields that allow multiple source columns (no dedup). */
const MULTI_MAP_TARGETS = new Set(["photoUrl"]);

// ─────────────────────────────────────────────────────────────────────────────
// Known patterns for auto-detecting column mappings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known patterns for auto-detecting column mappings.
 * Each entry maps a list of source column name patterns (case-insensitive)
 * to a target Darwin Core / measurement field name.
 * Order within each group determines priority (first match wins).
 */
const KNOWN_PATTERNS: { patterns: string[]; target: string }[] = [
  // Occurrence fields
  {
    patterns: ["lat", "latitude", "decimal_latitude", "decimallatitude", "y"],
    target: "decimalLatitude",
  },
  {
    patterns: ["lon", "lng", "longitude", "decimal_longitude", "decimallongitude", "x"],
    target: "decimalLongitude",
  },
  {
    patterns: ["species", "scientific_name", "scientificname", "taxon", "taxon_name"],
    target: "scientificName",
  },
  {
    patterns: [
      "date",
      "event_date",
      "eventdate",
      "observation_date",
      "collection_date",
    ],
    target: "eventDate",
  },
  {
    patterns: ["recorder", "recorded_by", "recordedby", "observer", "collector"],
    target: "recordedBy",
  },
  {
    patterns: [
      "common_name",
      "commonname",
      "vernacular",
      "vernacular_name",
      "vernacularname",
    ],
    target: "vernacularName",
  },
  {
    patterns: ["remarks", "notes", "occurrence_remarks", "occurrenceremarks", "comments"],
    target: "occurrenceRemarks",
  },
  { patterns: ["country"], target: "country" },
  { patterns: ["locality", "location", "site", "place"], target: "locality" },
  { patterns: ["habitat", "habitat_type"], target: "habitat" },

  // Measurement fields
  { patterns: ["dbh", "diameter_breast_height", "trunk_diameter"], target: "dbh" },
  { patterns: ["height", "tree_height", "total_height"], target: "height" },
  { patterns: ["diameter"], target: "diameter" },
  {
    patterns: [
      "canopycoverpercent",
      "canopy_cover_percent",
      "canopy_cover_pct",
      "canopy_cover",
    ],
    target: "canopyCoverPercent",
  },

  // Media fields — photoUrl allows multiple columns (multi-photo per tree)
  {
    patterns: [
      "photo_url",
      "photourl",
      "photo",
      "image_url",
      "imageurl",
      "image",
      "attachment",
      "attachment_url",
      "picture",
      "picture_url",
      // Multi-photo patterns (subject part is inferred from the column name)
      "photo_tree",
      "photo_leaf",
      "photo_bark",
      "photo_flower",
      "photo_fruit",
      "photo_stem",
      "photo_root",
      "photo_seed",
      "photo_bud",
      "photo_twig",
      "tree_photo",
      "leaf_photo",
      "bark_photo",
      "flower_photo",
      "fruit_photo",
      "stem_photo",
    ],
    target: "photoUrl",
  },
];

/**
 * Auto-detect column mappings for generic CSV files based on common field naming conventions.
 * Matching is case-insensitive. For most targets, only the first matching column wins.
 * For targets in MULTI_MAP_TARGETS (e.g. photoUrl), multiple columns can map to the same
 * target — this enables multi-photo-per-tree support.
 * NOTE: 'name' alone does NOT map to vernacularName.
 *
 * @param headers - Array of CSV column header strings
 * @returns Array of ColumnMapping objects for recognized headers
 */
export function autoDetectMappings(headers: string[]): ColumnMapping[] {
  // Track which targets have already been claimed to enforce "first match wins"
  // (except for multi-map targets like photoUrl)
  const claimedTargets = new Set<string>();
  const mappings: ColumnMapping[] = [];

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();

    for (const { patterns, target } of KNOWN_PATTERNS) {
      const isMultiMap = MULTI_MAP_TARGETS.has(target);

      if (patterns.includes(normalizedHeader) && (isMultiMap || !claimedTargets.has(target))) {
        if (!isMultiMap) {
          claimedTargets.add(target);
        }
        mappings.push({ sourceColumn: header, targetField: target });
        break;
      }
    }
  }

  return mappings;
}

/**
 * Apply column mappings to an array of raw CSV rows.
 * For each row, creates a new object with target field names as keys.
 * Transform functions from mappings are applied when present.
 * Source columns not in mappings are dropped.
 * Empty/undefined source values are excluded from the output row.
 *
 * @param rows - Array of raw CSV rows (source column names as keys)
 * @param mappings - Array of ColumnMapping objects describing the remapping
 * @returns Array of MappedRow objects with target field names as keys
 */
export function applyMappings(
  rows: Record<string, string>[],
  mappings: ColumnMapping[]
): MappedRow[] {
  return rows.map((row) => {
    const mappedRow: MappedRow = {};

    for (const { sourceColumn, targetField, transform } of mappings) {
      const rawValue = row[sourceColumn];

      // Skip empty or undefined values
      if (rawValue === undefined || rawValue === "") {
        continue;
      }

      const value = transform ? transform(rawValue) : rawValue;
      mappedRow[targetField] = value;
    }

    return mappedRow;
  });
}
