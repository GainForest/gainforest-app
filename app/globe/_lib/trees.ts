/**
 * Measured trees — port of Green Globe's measured-trees pipeline
 * (`fetchMeasuredTreesShapefile` + `normalizeMeasuredTreesGeoJSON`).
 *
 * An organization's planted/measured trees live as one GeoJSON file, resolved
 * in priority order:
 *   1. `trees` blob refs on the org's `app.gainforest.organization.site`
 *      records (fetched via `com.atproto.sync.getBlob`; sites usually share
 *      one blob, so blobs are de-duplicated by CID),
 *   2. the legacy GainForest data bucket:
 *      `shapefiles/{org-slug}-all-tree-plantings.geojson`.
 */

import { blobUrl, resolvePdsHost } from "../../_lib/pds";
import { GLOBE_DATA_BUCKET } from "./config";
import { toKebabCase } from "./layers";

const SITE_COLLECTION = "app.gainforest.organization.site";

/** PDS handles are truncated to 18 chars; map truncated slugs to their full
 *  bucket file names (port of Green Globe's SLUG_OVERRIDES). */
const SLUG_OVERRIDES: Record<string, string> = {
  "oceanus-conservati": "oceanus-conservation",
  "centre-for-sustain": "centre-for-sustainability-ph",
  "albertine-rural-re": "albertine-rural-restoration-alert",
  "million-trees-proj": "million-trees-project",
  "youth-leading-envi": "youth-leading-environmental-change",
  "la-cotinga-biologi": "la-cotinga-biological-station",
  "reserva-natural-mo": "reserva-natural-monte-alegre",
  "pandu-alam-lestari": "pandu-alam-lestari-foundation",
  "forrest-forest-reg":
    "forrest-forest-regeneration-and-environmental-sustainability-trust",
  "community-based-en": "community-based-environmental-conservation",
  "defensores-del-cha": "defensores-del-chaco",
  "south-rift-associa": "south-rift-association-of-landowners",
  "bees-and-trees-uga": "bees-and-trees-uganda",
  "northern-rangeland": "northern-rangelands-trust",
  "masungi-georeserve": "masungi",
  "green-ambassadors": "green-ambassador",
  "nature-and-people": "nature-and-people-as-one",
  "xprize-rainfor-21p": "xprize-rainforest-finals",
};

// ── Blob-ref plumbing (same wrapper shapes Green Globe handles) ────────────

/** Unwrap `{ $type: "…#smallBlob", blob: <BlobRef> }` union wrappers. */
function unwrapSmallBlob(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "blob" in value) {
    return (value as Record<string, unknown>).blob;
  }
  return value;
}

/** Extract the CID string from a blob ref's `ref` field ($link or raw CID). */
function extractBlobCid(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const ref = (value as { ref?: unknown }).ref;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null) {
    const link = (ref as { $link?: unknown }).$link;
    if (typeof link === "string") return link;
  }
  return null;
}

// ── Normalisation (port of normalizeMeasuredTreesGeoJSON) ──────────────────

type TreeProperties = Record<string, unknown>;

function upperCaseEveryWord(name: string): string {
  return name.replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase());
}

/** Species display name — kobo exports use `Plant_Name`, newer data `species`. */
export function treeSpeciesName(properties: TreeProperties | null): string | null {
  if (!properties) return null;
  const plantName = properties.Plant_Name;
  if (typeof plantName === "string" && plantName.trim()) {
    return upperCaseEveryWord(plantName.trim());
  }
  const species = properties.species;
  if (typeof species === "string" && species.trim()) return species.trim();
  return null;
}

function treeMetric(properties: TreeProperties, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** Height in metres (iNaturalist `Height` / kobo `height`). */
export function treeHeight(properties: TreeProperties | null): string | null {
  if (!properties) return null;
  const value = treeMetric(properties, ["Height", "height"]);
  return value ? `${value}m` : null;
}

/** Diameter at breast height in cm (`DBH` / kobo `diameter`). */
export function treeDbh(properties: TreeProperties | null): string | null {
  if (!properties) return null;
  const value = treeMetric(properties, ["DBH", "diameter"]);
  return value ? `${value}cm` : null;
}

/** Date the tree was measured/planted (first populated of the known fields). */
function treeDate(properties: TreeProperties | null): string | null {
  if (!properties) return null;
  return treeMetric(properties, [
    "dateOfMeasurement",
    "FCD-tree_records-tree_time",
    "dateMeasured",
    "datePlanted",
    "tree_time",
  ]);
}

/** Free-text field notes, when present. */
function treeNotes(properties: TreeProperties | null): string | null {
  if (!properties) return null;
  return treeMetric(properties, ["FCD-tree_records-notes", "notes", "remarks"]);
}

/** Turn a Google Drive share link into an embeddable image URL; pass other
 *  URLs through unchanged. */
function toEmbeddableImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!/drive\.google\.com/.test(trimmed)) return trimmed;
  const id =
    trimmed.match(/[?&]id=([^&]+)/)?.[1] ?? trimmed.match(/\/d\/([^/]+)/)?.[1] ?? null;
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : trimmed;
}

/** Photo angles for a tree (main → leaf → bark → root → fruit), de-duplicated
 *  and normalised to embeddable URLs. Port of Green Globe's getTreePhotos,
 *  minus the project-specific S3 placeholders. */
function treePhotos(properties: TreeProperties | null): string[] {
  if (!properties) return [];
  const groups = [
    ["tree_photo", "FCD-tree_records-tree_photo", "awsUrl", "koboUrl"],
    ["FCD-tree_records-leaves_photo", "leafAwsUrl", "leafKoboUrl"],
    ["FCD-tree_records-bark_photo", "barkAwsUrl", "barkKoboUrl"],
    ["FCD-tree_records-root_photo"],
    ["FCD-tree_records-fruit_flower_seed_photo"],
  ];
  const photos: string[] = [];
  for (const group of groups) {
    const raw = group
      .map((key) => properties[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 1);
    if (!raw) continue;
    const url = toEmbeddableImageUrl(raw);
    if (url && !photos.includes(url)) photos.push(url);
  }
  return photos;
}

/** Everything the tree detail sidebar needs, derived from a feature. */
export type TreeDetail = {
  id: string | number;
  species: string | null;
  height: string | null;
  dbh: string | null;
  date: string | null;
  notes: string | null;
  photos: string[];
};

/** Build a `TreeDetail` from a clicked feature's id + properties. */
export function treeDetail(
  id: string | number,
  properties: TreeProperties | null,
): TreeDetail {
  return {
    id,
    species: treeSpeciesName(properties),
    height: treeHeight(properties),
    dbh: treeDbh(properties),
    date: treeDate(properties),
    notes: treeNotes(properties),
    photos: treePhotos(properties),
  };
}

function isPointFeature(feature: unknown): feature is GeoJSON.Feature<GeoJSON.Point> {
  if (typeof feature !== "object" || feature === null) return false;
  const geometry = (feature as GeoJSON.Feature).geometry;
  return (
    typeof geometry === "object" &&
    geometry !== null &&
    geometry.type === "Point" &&
    Array.isArray((geometry as GeoJSON.Point).coordinates) &&
    typeof (geometry as GeoJSON.Point).coordinates[0] === "number" &&
    typeof (geometry as GeoJSON.Point).coordinates[1] === "number"
  );
}

/** Keep point features only, stamp a stable numeric id + species property so
 *  the map layers (and hover cards) have uniform data to work with. */
function normalizeTrees(raw: unknown): GeoJSON.FeatureCollection | null {
  if (typeof raw !== "object" || raw === null) return null;
  const collection = raw as GeoJSON.FeatureCollection;
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return null;
  }
  const features = collection.features.filter(isPointFeature).map((feature, index) => ({
    ...feature,
    id: index,
    properties: {
      ...(feature.properties ?? {}),
      species: treeSpeciesName(feature.properties) ?? "Unknown",
      type: "measured-tree",
    },
  }));
  if (features.length === 0) return null;
  return { type: "FeatureCollection", features };
}

// ── Fetchers ────────────────────────────────────────────────────────────────

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return null;
  }
}

/** Unique `trees` blob CIDs across the org's site records. */
async function fetchSiteTreeCids(
  host: string,
  did: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const cids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ repo: did, collection: SITE_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const json = (await fetchJson(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params}`,
      signal,
    )) as { records?: Array<{ value?: { trees?: unknown } }>; cursor?: string } | null;
    if (!json) break;
    for (const record of json.records ?? []) {
      const cid = extractBlobCid(unwrapSmallBlob(record.value?.trees));
      if (cid) cids.add(cid);
    }
    if (!json.cursor || (json.records ?? []).length === 0) break;
    cursor = json.cursor;
  }
  return [...cids];
}

/** Legacy bucket slug, derived from the org handle's first label. */
async function fetchOrgSlug(
  host: string,
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const json = (await fetchJson(
    `https://${host}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`,
    signal,
  )) as { handle?: unknown } | null;
  const handle = typeof json?.handle === "string" ? json.handle : null;
  const rawSlug = handle?.split(".")[0]?.trim();
  if (!rawSlug) return null;
  return SLUG_OVERRIDES[rawSlug] ?? toKebabCase(rawSlug);
}

const treesCache = new Map<string, Promise<GeoJSON.FeatureCollection | null>>();

/** All measured trees for one organization (null when it has none). */
export function fetchOrganizationTrees(
  did: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  let promise = treesCache.get(did);
  if (!promise) {
    promise = (async () => {
      const host = await resolvePdsHost(did, signal);

      // Path 1: `trees` blobs on the org's site records.
      if (host) {
        const cids = await fetchSiteTreeCids(host, did, signal);
        const features: GeoJSON.Feature[] = [];
        for (const cid of cids) {
          const normalized = normalizeTrees(await fetchJson(blobUrl(host, did, cid), signal));
          if (normalized) features.push(...normalized.features);
        }
        if (features.length > 0) {
          // Re-stamp ids so merged blobs stay unique for feature-state.
          return {
            type: "FeatureCollection",
            features: features.map((feature, index) => ({ ...feature, id: index })),
          };
        }
      }

      // Path 2: legacy bucket shapefile by org slug.
      const slug = host ? await fetchOrgSlug(host, did, signal) : null;
      if (!slug) return null;
      return normalizeTrees(
        await fetchJson(
          `${GLOBE_DATA_BUCKET}/shapefiles/${slug}-all-tree-plantings.geojson`,
          signal,
        ),
      );
    })();
    treesCache.set(did, promise);
    promise.catch(() => {
      if (treesCache.get(did) === promise) treesCache.delete(did);
    });
  }
  // Callers share one in-flight promise; aborting one caller must not kill it.
  return promise;
}
