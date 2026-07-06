/**
 * Globe map configuration — a native port of Green Globe's Mapbox setup onto
 * MapLibre GL (token-free): satellite imagery + reference labels as raster
 * sources, globe projection, and the same space/atmosphere treatment as
 * data.gainforest.app's MAP_FOG_CONFIG.
 */

import type { StyleSpecification } from "maplibre-gl";

/** GainForest public data bucket (global + per-project layer data). Same
 *  bucket data.gainforest.app reads; it serves `access-control-allow-origin: *`. */
export const GLOBE_DATA_BUCKET = "https://gainforest-transparency-dashboard.s3.amazonaws.com";

/** TiTiler endpoint used to tile raster (COG) layers, as on Green Globe. */
export const GLOBE_TITILER_ENDPOINT = "https://t7mvfdyitg.execute-api.eu-west-3.amazonaws.com";

/** ESA WorldCover 2021 land-cover tiles. Green Globe used the legacy
 *  services.terrascope.be WMTS, which no longer responds; Terrascope's
 *  MapProxy serves the same layer as fast RESTful tiles with CORS `*`. */
export const LANDCOVER_TILES_URL =
  "https://mapproxy.terrascope.be/mapproxy/wmts/esa-worldcover-map-10m-2021-v2_map/webmercator/{z}/{x}/{y}.png";

/** Ma Earth logomark, cropped into the shared small circular badge for
 *  Ma Earth–funded organizations that don't have their own avatar yet. */
export const MA_EARTH_LOGO_URL = "/assets/media/images/badges/ma-earth-logo.webp";

/** Initial camera — mirrors Green Globe's MAP_CONFIG. */
export const GLOBE_INITIAL_CENTER: [number, number] = [102, 9];
export const GLOBE_INITIAL_ZOOM = 2;

/** Land-cover classes shown in the legend (ESA WorldCover 2021). */
export const LANDCOVER_LEGEND: Array<{ color: string; labelKey: string }> = [
  { color: "#006400", labelKey: "treeCover" },
  { color: "#ffbb22", labelKey: "shrubland" },
  { color: "#ffff4c", labelKey: "grassland" },
  { color: "#f096ff", labelKey: "cropland" },
  { color: "#fa0000", labelKey: "builtUp" },
  { color: "#b4b4b4", labelKey: "bareVegetation" },
  { color: "#0064c8", labelKey: "water" },
  { color: "#0096a0", labelKey: "wetland" },
  { color: "#00cf75", labelKey: "mangroves" },
];

export const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Base style: Esri World Imagery (satellite) + Esri boundaries/places labels,
 * with globe projection and the Green Globe space/atmosphere look. All layers
 * added at runtime (sites, markers, data layers) stack on top of `ref-labels`.
 */
export function globeMapStyle(): StyleSpecification {
  return {
    version: 8,
    // Glyphs are required in case any symbol layer with text is added.
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    projection: { type: "globe" },
    sky: {
      // Port of Green Globe's MAP_FOG_CONFIG: deep-space background with a
      // blue atmosphere halo around the planet.
      "sky-color": "#0b0b19",
      "horizon-color": "#245cdf",
      "fog-color": "#0b0b19",
      "fog-ground-blend": 0.6,
      "horizon-fog-blend": 0.6,
      "sky-horizon-blend": 0.9,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 8, 1, 11, 0] as unknown as number,
    },
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        // Esri serves literal "Map data not yet available" placeholder tiles
        // past the locally available imagery resolution — in the remote areas
        // most project sites live in, that kicks in right around z17–18.
        // Capping the source here makes MapLibre overzoom the deepest real
        // tiles instead of rendering the gray placeholders.
        maxzoom: 17,
        attribution:
          '<a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics | <a href="https://esa-worldcover.org/" target="_blank" rel="noreferrer">ESA WorldCover</a> | © GainForest',
      },
      "ref-labels": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: "space", type: "background", paint: { "background-color": "#0b0b19" } },
      { id: "satellite", type: "raster", source: "satellite" },
      { id: "ref-labels", type: "raster", source: "ref-labels", paint: { "raster-opacity": 0.9 } },
    ],
  };
}
