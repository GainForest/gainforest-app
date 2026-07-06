/**
 * Shared types for the native 3D globe (ported from Green Globe /
 * data.gainforest.app so the experience lives inside this app instead of an
 * embedded iframe).
 */

export type GlobeOrganization = {
  did: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code when known. */
  country: string | null;
  /** Curated map point (marker position). Null when the org has no pin yet. */
  lat: number | null;
  lon: number | null;
  /** True when the organization carries a Ma Earth badge (any round). */
  maEarth?: boolean;
  /** Published drone-imagery layers (orthomosaics / aerial tiles). */
  droneLayers?: number;
  /** All published map data layers (drone imagery included). */
  dataLayers?: number;
};

export type GlobeLegendEntry = {
  label: string;
  color: string;
  value?: string;
};

/** Layer render strategies supported by the ported Green Globe map. */
export type GlobeLayerType =
  | "geojson_points"
  | "geojson_points_trees"
  | "geojson_line"
  | "choropleth"
  | "choropleth_shannon"
  | "raster_tif"
  | "tms_tile"
  | "heatmap"
  | "contour"
  | "satellite_overlay";

export type GlobeLayer = {
  /** Stable kebab-case id used as the map source/layer id. */
  id: string;
  name: string;
  type: GlobeLayerType;
  /** Endpoint relative to the GainForest data bucket, or an absolute URL. */
  endpoint: string;
  description: string;
  category: string;
  legend?: GlobeLegendEntry[];
  isDefault?: boolean;
  /** Geographic footprint declared on the record — lets the camera fly to
   *  exactly what a toggle just made visible. */
  bounds?: LngLatBounds | null;
};

/** A project site (certified location) resolved for map display. */
export type GlobeSite = {
  uri: string;
  rkey: string;
  name: string;
  /** Resolved GeoJSON boundary URL (PDS blob or external), when the site is a shape. */
  geojsonUrl: string | null;
  /** Bare coordinate for point-style locations. */
  point: { lat: number; lon: number } | null;
};

/** One org's measured-tree count, as served by `/api/globe/trees`. */
export type GlobeTreeStat = {
  did: string;
  trees: number;
};

export type LngLatBounds = [number, number, number, number];
