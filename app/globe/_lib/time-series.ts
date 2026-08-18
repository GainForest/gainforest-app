/**
 * Drone time-series detection.
 *
 * Organizations fly drones over the same site at different times, so their
 * published orthomosaics (raster layers) can overlap on the map — toggling
 * them individually just stacks one image on top of another. This module
 * groups repeat flights of the same area into a "time series" so the UI can
 * offer a time slider instead of a pile of indistinguishable toggles.
 *
 * Two sources, in order of preference:
 *
 * 1. Author-declared groups: layers whose `groupRef` points at an
 *    `app.gainforest.organization.layerGroup` record (a named monitored
 *    area). Members with ≥ 2 distinct `capturedAt` days become a series named
 *    after the group; members sharing a day are products of the same survey
 *    (e.g. orthomosaic + tree delineations) and share one slider stop.
 *
 * 2. Geometric inference for legacy ungrouped records, from data already on
 *    the layer:
 *      - `bounds`      — the image footprint ("minLng,minLat,maxLng,maxLat")
 *      - `capturedAt`  — the capture day (dataDate / capturedAt / timeLabel,
 *                        or a date embedded in the name/description)
 *    Two drone images belong to the same series when their footprints overlap
 *    substantially — intersection area ≥ half of the smaller footprint —
 *    which distinguishes repeat flights (near-identical or contained
 *    footprints) from adjacent plots surveyed in one campaign (small edge
 *    overlaps). Overlap groups are only promoted when they span at least two
 *    distinct capture days; same-day overlaps are complementary coverage, not
 *    change over time.
 */

import type { GlobeLayer, GlobeLayerGroup, LngLatBounds } from "./globe-types";

/** Layer types that render drone/aerial imagery (matches the roster API). */
const DRONE_LAYER_TYPES = new Set<GlobeLayer["type"]>(["raster_tif", "tms_tile"]);

/** Minimum intersection-over-smaller-footprint for two flights to count as
 *  covering "the same area". Repeat flights score ≈1; adjacent survey plots
 *  that merely touch score well below this. */
const OVERLAP_RATIO = 0.5;

export type DroneTimeSeriesStep = {
  /** Capture day, "YYYY-MM-DD". */
  date: string;
  /** Layer ids captured on that day (usually one). */
  layerIds: string[];
};

export type DroneTimeSeries = {
  /** Stable id (derived from member layer ids). */
  id: string;
  /** Display name shared by the flights (dates stripped). */
  name: string;
  /** Union of all member footprints — where the camera flies to. */
  bounds: LngLatBounds;
  /** All member layers, oldest capture first. */
  layers: GlobeLayer[];
  /** Distinct capture days, ascending — the slider's stops. */
  steps: DroneTimeSeriesStep[];
};

function boundsArea(bounds: LngLatBounds): number {
  return Math.max(0, bounds[2] - bounds[0]) * Math.max(0, bounds[3] - bounds[1]);
}

/** Intersection area over the smaller footprint's area (0 when disjoint). */
export function overlapRatio(a: LngLatBounds, b: LngLatBounds): number {
  const width = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (width <= 0 || height <= 0) return 0;
  const smaller = Math.min(boundsArea(a), boundsArea(b));
  if (smaller <= 0) return 0;
  return (width * height) / smaller;
}

function unionBounds(all: LngLatBounds[]): LngLatBounds | null {
  if (all.length === 0) return null;
  return all.reduce((acc, bounds) => [
    Math.min(acc[0], bounds[0]),
    Math.min(acc[1], bounds[1]),
    Math.max(acc[2], bounds[2]),
    Math.max(acc[3], bounds[3]),
  ]);
}

/** Strip date decorations from a flight name: "Tumanan (2025-04-09)" and
 *  "Orthomosaic 2024-08-21" both lose their dates. */
function stripDates(name: string): string {
  return name
    .replace(/\(\s*\d{2,4}-\d{2}-\d{2,4}\s*\)/g, " ")
    .replace(/\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—:,]+$/g, "")
    .trim();
}

/** Shared display name for a series: the members' common date-less name, or
 *  their longest common prefix, or the first member's cleaned name. */
function seriesName(layers: GlobeLayer[]): string {
  const cleaned = layers.map((layer) => stripDates(layer.name)).filter(Boolean);
  if (cleaned.length === 0) return layers[0]?.name ?? "";
  const unique = new Set(cleaned.map((name) => name.toLowerCase()));
  if (unique.size === 1) return cleaned[0]!;
  let prefix = cleaned[0]!;
  for (const name of cleaned.slice(1)) {
    while (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1);
    }
  }
  prefix = prefix.replace(/[\s\-–—:,(]+$/g, "").trim();
  return prefix.length >= 3 ? prefix : cleaned[0]!;
}

/** Turn one set of dated layers into a series (steps = distinct days). */
function toSeries(
  id: string,
  name: string,
  members: Array<GlobeLayer & { capturedAt: string }>,
  extraBounds: LngLatBounds | null,
): DroneTimeSeries | null {
  const days = new Set(members.map((layer) => layer.capturedAt));
  if (members.length < 2 || days.size < 2) return null;

  const memberBounds = members
    .map((layer) => layer.bounds)
    .filter((bounds): bounds is LngLatBounds => Array.isArray(bounds));
  if (extraBounds) memberBounds.push(extraBounds);
  const bounds = unionBounds(memberBounds);
  // Without any footprint the camera cannot fly and overlap cannot be shown
  // meaningfully — leave such layers to the normal toggle flow.
  if (!bounds) return null;

  const sorted = [...members].sort(
    (a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id),
  );
  return {
    id,
    name,
    bounds,
    layers: sorted,
    steps: [...days].sort().map((date) => ({
      date,
      layerIds: sorted.filter((layer) => layer.capturedAt === date).map((layer) => layer.id),
    })),
  };
}

function hasCaptureDay(layer: GlobeLayer): layer is GlobeLayer & { capturedAt: string } {
  return typeof layer.capturedAt === "string";
}

/** Group an organization's layers into time series: author-declared layer
 *  groups first, then geometric inference over the remaining (legacy) drone
 *  layers. Series are returned sorted by name. */
export function buildDroneTimeSeries(
  layers: GlobeLayer[],
  groups: GlobeLayerGroup[] = [],
): DroneTimeSeries[] {
  const series: DroneTimeSeries[] = [];

  // ── 1. Declared groups (any layer type may ride the timeline) ─────────
  const groupsByUri = new Map(groups.map((group) => [group.uri, group]));
  const claimed = new Set<string>();
  for (const group of groups) {
    const members = layers.filter(
      (layer): layer is GlobeLayer & { capturedAt: string } =>
        layer.groupRef === group.uri && hasCaptureDay(layer),
    );
    const built = toSeries(group.uri, group.name, members, group.bounds);
    if (built) {
      series.push(built);
      for (const layer of built.layers) claimed.add(layer.id);
    }
  }

  // ── 2. Geometric fallback for layers without a resolvable group ────────
  // Layers whose author placed them in a known group stay out of the
  // heuristic even when that group did not become a series — declared intent
  // wins over inference.
  const flights = layers.filter(
    (layer): layer is GlobeLayer & { bounds: LngLatBounds; capturedAt: string } =>
      DRONE_LAYER_TYPES.has(layer.type) &&
      Array.isArray(layer.bounds) &&
      hasCaptureDay(layer) &&
      !claimed.has(layer.id) &&
      !(layer.groupRef && groupsByUri.has(layer.groupRef)),
  );
  if (flights.length < 2) return series.sort((a, b) => a.name.localeCompare(b.name));

  // Union-find over pairwise footprint overlap.
  const parent = flights.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (let a = 0; a < flights.length; a++) {
    for (let b = a + 1; b < flights.length; b++) {
      if (overlapRatio(flights[a]!.bounds, flights[b]!.bounds) >= OVERLAP_RATIO) {
        parent[find(a)] = find(b);
      }
    }
  }

  const clusters = new Map<number, typeof flights>();
  flights.forEach((flight, index) => {
    const root = find(index);
    const cluster = clusters.get(root) ?? [];
    cluster.push(flight);
    clusters.set(root, cluster);
  });

  for (const cluster of clusters.values()) {
    const built = toSeries(
      `time-series:${cluster.map((flight) => flight.id).sort().join("+")}`,
      seriesName(cluster),
      cluster,
      null,
    );
    if (built) series.push(built);
  }

  return series.sort((a, b) => a.name.localeCompare(b.name));
}
