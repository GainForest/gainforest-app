/**
 * Partners globe configuration — trimmed port of
 * `bumicerts-clean-rewrite/app/globe/_lib/config.ts` (the merged app's
 * /globe view): Esri satellite + reference labels as raster sources,
 * MapLibre globe projection, and Green Globe's space/atmosphere look.
 * The landcover / TiTiler / data-layer constants were dropped — the
 * landing only needs the base globe + organization markers.
 */

import type { StyleSpecification } from "maplibre-gl";

/** Ma Earth logomark, cropped into the shared small circular badge for
 *  Ma Earth–funded organizations that don't have their own avatar yet.
 *  Mirrored from bumicerts-clean-rewrite's badge asset. */
export const MA_EARTH_LOGO_URL = "/decor/ma-earth-logo.webp";

/** Initial camera — mirrors Green Globe's MAP_CONFIG. */
export const GLOBE_INITIAL_CENTER: [number, number] = [102, 9];
export const GLOBE_INITIAL_ZOOM = 1.4;

export const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Base style: Esri World Imagery (satellite) + Esri boundaries/places
 * labels, with globe projection and the Green Globe space/atmosphere
 * treatment. Verbatim from bumicerts-clean-rewrite's `globeMapStyle()`.
 */
export function globeMapStyle(): StyleSpecification {
  return {
    version: 8,
    // Glyphs are required in case any symbol layer with text is added.
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    projection: { type: "globe" },
    sky: {
      // Port of Green Globe's MAP_FOG_CONFIG: deep-space background with
      // a blue atmosphere halo around the planet.
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
        maxzoom: 19,
        attribution:
          '<a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics | © GainForest',
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

// ── Country formatting (port of the app's `format.ts` helpers used by
//    the marker hover popup) ────────────────────────────────────────────

export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function countryName(code: string | null | undefined): string {
  const raw = code?.trim();
  if (!raw) return "";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(raw.toUpperCase()) ??
      raw
    );
  } catch {
    return raw;
  }
}
