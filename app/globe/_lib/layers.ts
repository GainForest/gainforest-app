/**
 * Data-layer catalog fetchers — ported from Green Globe's LayersOverlay store.
 *
 * Global layers come from the GainForest data bucket's
 * `layers/global/layerData.json`; per-organization layers come from
 * `app.gainforest.organization.layer` records in the org's PDS repo (falling
 * back to the bucket's legacy per-project `layerData.json` is intentionally
 * dropped — records are the canonical source now).
 */

import { resolvePdsHost } from "../../_lib/pds";
import { GLOBE_DATA_BUCKET } from "./config";
import type {
  GlobeLayer,
  GlobeLayerGroup,
  GlobeLayerType,
  GlobeLegendEntry,
  LngLatBounds,
} from "./globe-types";

const LAYER_COLLECTION = "app.gainforest.organization.layer";
const LAYER_GROUP_COLLECTION = "app.gainforest.organization.layerGroup";

const VALID_LAYER_TYPES = new Set<GlobeLayerType>([
  "geojson_points",
  "geojson_points_trees",
  "geojson_line",
  "choropleth",
  "choropleth_shannon",
  "raster_tif",
  "tms_tile",
  "heatmap",
  "contour",
  "satellite_overlay",
]);

/** Layer types the ported map can actually render. */
const RENDERABLE_LAYER_TYPES = new Set<GlobeLayerType>([
  "geojson_points",
  "geojson_line",
  "choropleth",
  "choropleth_shannon",
  "raster_tif",
  "tms_tile",
]);

export function toKebabCase(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Layer records template environment variables into endpoints; strip them the
 *  same way Green Globe does. */
function cleanLayerEndpoint(endpoint: string): string {
  return endpoint.replace(/\$\{process\.env\.(AWS_STORAGE|TITILER_ENDPOINT)\}(\/)?/g, "");
}

export function resolveLayerUrl(endpoint: string): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) return endpoint;
  return `${GLOBE_DATA_BUCKET}/${endpoint}`;
}

type RawLayer = {
  name?: unknown;
  type?: unknown;
  endpoint?: unknown;
  uri?: unknown;
  description?: unknown;
  category?: unknown;
  isDefault?: unknown;
  legend?: unknown;
  bounds?: unknown;
  dataDate?: unknown;
  capturedAt?: unknown;
  timeLabel?: unknown;
  groupRef?: unknown;
};

/** Normalize any recognizable date to "YYYY-MM-DD". Accepts ISO days/datetimes
 *  and the "DD-MM-YYYY" form used in legacy layer descriptions. */
function extractDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  const dmy = iso ? null : value.match(/(\d{2})-(\d{2})-(\d{4})/);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : [NaN, NaN, NaN];
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Capture day of a layer record: explicit fields first, then dates embedded
 *  in the name ("Tumanan (2025-04-09)") or description ("Drone image from
 *  09-04-2025") for records published before the dedicated fields existed. */
function parseCaptureDay(raw: RawLayer): string | null {
  return (
    extractDay(raw.dataDate) ??
    extractDay(raw.capturedAt) ??
    extractDay(raw.timeLabel) ??
    extractDay(raw.name) ??
    extractDay(raw.description)
  );
}

/** Parse a record's `bounds` string ("minLng,minLat,maxLng,maxLat"). */
function parseBounds(raw: unknown): LngLatBounds | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return undefined;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return undefined;
  if (minLng > maxLng || minLat > maxLat) return undefined;
  return [minLng, minLat, maxLng, maxLat];
}

function parseLegend(raw: unknown): GlobeLegendEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const entries = raw
    .filter(
      (entry): entry is { label: string; color: string; value?: unknown } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { label?: unknown }).label === "string" &&
        typeof (entry as { color?: unknown }).color === "string",
    )
    .map((entry) => ({
      label: entry.label,
      color: entry.color,
      value: typeof entry.value === "string" ? entry.value : undefined,
    }));
  return entries.length > 0 ? entries : undefined;
}

function normalizeLayer(raw: RawLayer, fallbackCategory: string): GlobeLayer | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const type =
    typeof raw.type === "string" && VALID_LAYER_TYPES.has(raw.type as GlobeLayerType)
      ? (raw.type as GlobeLayerType)
      : "geojson_points";
  if (!RENDERABLE_LAYER_TYPES.has(type)) return null;
  const endpointRaw =
    typeof raw.endpoint === "string" ? raw.endpoint : typeof raw.uri === "string" ? raw.uri : "";
  const endpoint = cleanLayerEndpoint(endpointRaw);
  if (!endpoint) return null;
  return {
    id: toKebabCase(name),
    name,
    type,
    endpoint,
    description: typeof raw.description === "string" ? raw.description : "",
    category: typeof raw.category === "string" && raw.category.trim() ? raw.category : fallbackCategory,
    legend: parseLegend(raw.legend),
    isDefault: typeof raw.isDefault === "boolean" ? raw.isDefault : undefined,
    bounds: parseBounds(raw.bounds),
    capturedAt: parseCaptureDay(raw),
    groupRef: typeof raw.groupRef === "string" && raw.groupRef.startsWith("at://") ? raw.groupRef : null,
  };
}

/** Global (planet-wide) data layers from the GainForest data bucket. */
export async function fetchGlobalLayers(signal?: AbortSignal): Promise<GlobeLayer[]> {
  const res = await fetch(`${GLOBE_DATA_BUCKET}/layers/global/layerData.json`, { signal });
  if (!res.ok) throw new Error(`global layers ${res.status}`);
  const json = (await res.json()) as { layers?: RawLayer[] };
  return (json.layers ?? [])
    .map((layer) => normalizeLayer(layer, "global"))
    .filter((layer): layer is GlobeLayer => layer !== null);
}

/** List every record of one collection in an org's repo (public XRPC
 *  listRecords, CORS-open), paged. */
async function listOrgRecords<T>(
  did: string,
  collection: string,
  signal?: AbortSignal,
): Promise<Array<{ uri: string; value: T }>> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return [];

  const records: Array<{ uri: string; value: T }> = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ repo: did, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params}`, {
      signal,
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      records?: Array<{ uri?: string; value?: T }>;
      cursor?: string;
    };
    for (const record of json.records ?? []) {
      if (typeof record.uri === "string" && record.value) {
        records.push({ uri: record.uri, value: record.value });
      }
    }
    if (!json.cursor || (json.records ?? []).length === 0) break;
    cursor = json.cursor;
  }
  return records;
}

/** Per-organization data layers from `app.gainforest.organization.layer`
 *  records in the org's repo. */
export async function fetchOrganizationLayers(
  did: string,
  signal?: AbortSignal,
): Promise<GlobeLayer[]> {
  const records = await listOrgRecords<RawLayer>(did, LAYER_COLLECTION, signal);
  return records
    .map((record) => normalizeLayer(record.value, "project"))
    .filter((layer): layer is GlobeLayer => layer !== null);
}

type RawLayerGroup = {
  name?: unknown;
  description?: unknown;
  bounds?: unknown;
};

/** Per-organization monitored areas (`app.gainforest.organization.layerGroup`).
 *  Layers point at these via `groupRef`; the group record itself carries only
 *  identity + display metadata. */
export async function fetchOrganizationLayerGroups(
  did: string,
  signal?: AbortSignal,
): Promise<GlobeLayerGroup[]> {
  const records = await listOrgRecords<RawLayerGroup>(did, LAYER_GROUP_COLLECTION, signal);
  const groups: GlobeLayerGroup[] = [];
  for (const { uri, value } of records) {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!name) continue;
    groups.push({
      uri,
      name,
      description: typeof value.description === "string" ? value.description : "",
      bounds: parseBounds(value.bounds) ?? null,
    });
  }
  return groups;
}
