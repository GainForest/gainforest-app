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
import type { GlobeLayer, GlobeLayerType, GlobeLegendEntry } from "./globe-types";

const LAYER_COLLECTION = "app.gainforest.organization.layer";

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
export function cleanLayerEndpoint(endpoint: string): string {
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
};

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

/** Per-organization data layers from `app.gainforest.organization.layer`
 *  records in the org's repo (public XRPC listRecords, CORS-open). */
export async function fetchOrganizationLayers(
  did: string,
  signal?: AbortSignal,
): Promise<GlobeLayer[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return [];

  const layers: GlobeLayer[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      repo: did,
      collection: LAYER_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params}`, {
      signal,
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      records?: Array<{ value?: RawLayer }>;
      cursor?: string;
    };
    for (const record of json.records ?? []) {
      const layer = record.value ? normalizeLayer(record.value, "project") : null;
      if (layer) layers.push(layer);
    }
    if (!json.cursor || (json.records ?? []).length === 0) break;
    cursor = json.cursor;
  }
  return layers;
}
