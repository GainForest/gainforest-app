"use client";

/**
 * GlobeMap — the interactive 3D globe, ported from Green Globe
 * (data.gainforest.app) onto MapLibre GL so it runs natively in this app:
 * spinning satellite globe with atmosphere, organization markers, project-site
 * boundaries, ESA WorldCover land cover, and the GainForest data layers.
 *
 * The component is fully prop-driven (no globals): parents own which org is
 * selected, which site polygons are shown, and which data layers are on.
 */

import maplibregl, {
  type LayerSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globe.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { countryFlag, formatCountry } from "../../_lib/format";
import { resolveDidProfile } from "../../_lib/did-profile";
import {
  EMPTY_FEATURE_COLLECTION,
  GLOBE_INITIAL_CENTER,
  GLOBE_INITIAL_ZOOM,
  GLOBE_TITILER_ENDPOINT,
  LANDCOVER_TILES_URL,
  MA_EARTH_LOGO_URL,
  globeMapStyle,
} from "../_lib/config";
import { resolveLayerUrl } from "../_lib/layers";
import { treeDbh, treeDetail, treeHeight, treeSpeciesName, type TreeDetail } from "../_lib/trees";
import {
  DEFAULT_BADGE_ID,
  MA_EARTH_BADGE_ID,
  buildCircleBadge,
  buildDefaultBadge,
  loadHtmlImage,
  orgLogoImageId,
} from "../_lib/markers";
import type { GlobeLayer, GlobeOrganization, LngLatBounds } from "../_lib/globe-types";

const MARKER_SOURCE = "projectMarkerSource";
const MARKER_LAYER = "projectMarkerLayer";
const SITES_SOURCE = "allSites";
const SITES_FILL_LAYER = "allSitesFill";
const SITES_OUTLINE_LAYER = "allSitesOutline";
const SITES_POINT_LAYER = "allSitesPoints";
const HIGHLIGHT_SOURCE = "highlightedSite";
const HIGHLIGHT_LAYER = "highlightedSiteOutline";
const LANDCOVER_SOURCE = "landCoverSource";
const LANDCOVER_LAYER = "landCoverLayer";
const TREES_SOURCE = "trees";
const TREES_CLUSTER_LAYER = "clusteredTrees";
const TREES_CLUSTER_COUNT_LAYER = "clusteredTreesCountText";
const TREES_POINT_LAYER = "unclusteredTrees";

type GlobeMapPadding = { top: number; bottom: number; left: number; right: number };

type GlobeMapProps = {
  organizations: GlobeOrganization[];
  onSelectOrganization?: (did: string) => void;
  /** Green boundaries for every site of the focused organization. */
  sitesGeojson?: GeoJSON.FeatureCollection | null;
  /** Yellow outline for the actively selected site. */
  highlightGeojson?: GeoJSON.FeatureCollection | null;
  /** Measured/planted trees of the focused organization (clustered pins). */
  treesGeojson?: GeoJSON.FeatureCollection | null;
  /** Fired when a single tree is clicked (or the selection is cleared). */
  onSelectTree?: (tree: TreeDetail | null) => void;
  /** Feature id of the actively selected tree (drives the highlight). */
  selectedTreeId?: string | number | null;
  /** When set (and whenever `boundsKey` changes), the camera fits here. */
  bounds?: LngLatBounds | null;
  boundsKey?: string | null;
  boundsPadding?: Partial<GlobeMapPadding>;
  /** Idle rotation — enabled on the global view, off when focused. */
  spin?: boolean;
  landcoverVisible?: boolean;
  /** Currently visible data layers (global + project-specific). */
  activeLayers?: GlobeLayer[];
  /** Fired once the base style + runtime layers are ready. */
  onLoaded?: () => void;
  className?: string;
};

/** Tree hover card: species + height/DBH, built via DOM (XSS-safe). */
function treePopupContent(properties: Record<string, unknown> | null): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("p");
  title.className = "globe-popup-name";
  title.textContent = treeSpeciesName(properties) ?? "—";
  root.appendChild(title);
  const metrics = [treeHeight(properties), treeDbh(properties)].filter(Boolean);
  if (metrics.length > 0) {
    const sub = document.createElement("p");
    sub.className = "globe-popup-country";
    sub.textContent = metrics.join(" · ");
    root.appendChild(sub);
  }
  return root;
}

/** Marker hover card: org name + country, built via DOM (XSS-safe). */
function popupContent(name: string, country: string | null): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("p");
  title.className = "globe-popup-name";
  title.textContent = name;
  root.appendChild(title);
  if (country) {
    const sub = document.createElement("p");
    sub.className = "globe-popup-country";
    sub.textContent = `${countryFlag(country)} ${formatCountry(country)}`.trim();
    root.appendChild(sub);
  }
  return root;
}

// ── Idle globe rotation (port of Green Globe's spinGlobe) ──────────────────

function spinGlobe(map: maplibregl.Map, enabled: boolean) {
  const secondsPerRevolution = 120;
  const maxSpinZoom = 5;
  const slowSpinZoom = 3;
  const zoom = map.getZoom();
  if (!enabled || zoom >= maxSpinZoom) return;
  let distancePerSecond = 360 / secondsPerRevolution;
  if (zoom > slowSpinZoom) {
    distancePerSecond *= (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom);
  }
  const center = map.getCenter();
  center.lng -= distancePerSecond;
  map.easeTo({ center, duration: 1000, easing: (n) => n });
}

// ── Dynamic data layers (port of Green Globe's sources-and-layers) ─────────

function dynamicLayerSpec(layer: GlobeLayer): LayerSpecification | null {
  switch (layer.type) {
    case "geojson_points": {
      const lower = layer.name.toLowerCase();
      let color = "#FFA500";
      if (lower.includes("airstrip")) color = "#FF4136";
      else if (lower.includes("water")) color = "#7FDBFF";
      else if (lower.includes("surface")) color = "#85144b";
      else if (lower.includes("raft")) color = "#000000";
      else if (lower.includes("basecamp")) color = "#2bce89";
      return {
        id: layer.id,
        type: "circle",
        source: layer.id,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": color,
          "circle-radius": 6,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2,
        },
      };
    }
    case "geojson_line":
      return {
        id: layer.id,
        type: "line",
        source: layer.id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#AC4197", "line-width": 2.5 },
      };
    case "choropleth":
      return {
        id: layer.id,
        type: "fill",
        source: layer.id,
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "species_richness"],
            0, "#471064",
            2.4, "#306D8E",
            4.8, "#219F86",
            7.2, "#68CB5C",
            9.6, "#71CE55",
            12, "#FDE724",
          ],
          "fill-opacity": 1,
        },
      };
    case "choropleth_shannon":
      return {
        id: layer.id,
        type: "fill",
        source: layer.id,
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "shannon_index"],
            0, "#471064",
            1, "#306D8E",
            2, "#219F86",
            3, "#68CB5C",
            4, "#71CE55",
            5, "#FDE724",
          ],
          "fill-opacity": 1,
        },
      };
    case "raster_tif":
    case "tms_tile":
      return {
        id: layer.id,
        type: "raster",
        source: layer.id,
        paint: { "raster-opacity": 1 },
      };
    default:
      return null;
  }
}

async function addDynamicLayer(map: maplibregl.Map, layer: GlobeLayer): Promise<void> {
  if (map.getLayer(layer.id)) return;

  if (!map.getSource(layer.id)) {
    if (layer.type === "raster_tif") {
      map.addSource(layer.id, {
        type: "raster",
        tiles: [
          `${GLOBE_TITILER_ENDPOINT}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=${encodeURIComponent(resolveLayerUrl(layer.endpoint))}`,
        ],
        tileSize: 256,
      });
    } else if (layer.type === "tms_tile") {
      map.addSource(layer.id, {
        type: "raster",
        tiles: [resolveLayerUrl(layer.endpoint)],
        tileSize: 256,
        scheme: "tms",
      });
    } else {
      // GeoJSON-backed layers: fetch the data first so a failed request never
      // leaves a dangling empty source.
      let data: GeoJSON.GeoJSON = EMPTY_FEATURE_COLLECTION;
      try {
        const res = await fetch(resolveLayerUrl(layer.endpoint));
        if (res.ok) data = (await res.json()) as GeoJSON.GeoJSON;
      } catch (error) {
        console.warn("[globe] data layer fetch failed", layer.name, error);
      }
      if (map.getSource(layer.id)) return;
      map.addSource(layer.id, { type: "geojson", data });
    }
  }

  const spec = dynamicLayerSpec(layer);
  if (spec && !map.getLayer(layer.id)) {
    // Keep site boundaries + markers above data layers.
    const beforeId = map.getLayer(SITES_FILL_LAYER) ? SITES_FILL_LAYER : undefined;
    map.addLayer(spec, beforeId);
  }
}

function removeDynamicLayer(map: maplibregl.Map, layerId: string): void {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(layerId)) map.removeSource(layerId);
}

// ── Component ──────────────────────────────────────────────────────────────

export function GlobeMap({
  organizations,
  onSelectOrganization,
  sitesGeojson,
  highlightGeojson,
  treesGeojson,
  onSelectTree,
  selectedTreeId = null,
  bounds,
  boundsKey,
  boundsPadding,
  spin = false,
  landcoverVisible = false,
  activeLayers = [],
  onLoaded,
  className,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const spinRef = useRef(spin);
  const selectRef = useRef(onSelectOrganization);
  const selectTreeRef = useRef(onSelectTree);
  selectTreeRef.current = onSelectTree;
  const loadedRef = useRef(onLoaded);
  const addedLayerIdsRef = useRef(new Set<string>());
  const organizationsRef = useRef(organizations);
  // did → whether that org's own logo badge has been added to the map yet
  // ( "pending" while the avatar is being fetched/cropped, "none" once it's
  // confirmed the org has no avatar so the fallback badge is used instead).
  const logoStatusRef = useRef(new Map<string, "pending" | "loaded" | "none">());
  selectRef.current = onSelectOrganization;
  loadedRef.current = onLoaded;
  organizationsRef.current = organizations;

  // Rebuild the marker source from the latest roster + whatever logo badges
  // have loaded so far. Called on roster changes and again each time an
  // individual org's logo finishes loading (so it swaps in without waiting
  // for the whole roster to re-fetch).
  const setMarkerData = useCallback(() => {
    const map = mapRef.current;
    const source = map?.getSource(MARKER_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: organizationsRef.current
        .filter((org) => typeof org.lat === "number" && typeof org.lon === "number")
        .map((org) => {
          const hasLogo = logoStatusRef.current.get(org.did) === "loaded";
          const iconId = hasLogo
            ? orgLogoImageId(org.did)
            : org.maEarth
              ? MA_EARTH_BADGE_ID
              : DEFAULT_BADGE_ID;
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [org.lon as number, org.lat as number] },
            properties: { did: org.did, name: org.name, country: org.country, maEarth: org.maEarth === true, iconId },
          };
        }),
    });
  }, []);

  // Fetch + crop one org's avatar into the shared badge image, then refresh
  // the marker source so it swaps in from the fallback badge.
  const ensureOrgLogo = useCallback(
    async (map: maplibregl.Map, did: string) => {
      if (logoStatusRef.current.has(did)) return;
      logoStatusRef.current.set(did, "pending");
      try {
        const profile = await resolveDidProfile(did);
        if (!profile.avatar) {
          logoStatusRef.current.set(did, "none");
          return;
        }
        const img = await loadHtmlImage(profile.avatar);
        const badge = buildCircleBadge(img, "cover");
        const id = orgLogoImageId(did);
        if (!map.hasImage(id)) map.addImage(id, badge.image, { pixelRatio: badge.pixelRatio });
        logoStatusRef.current.set(did, "loaded");
        setMarkerData();
      } catch {
        logoStatusRef.current.set(did, "none");
      }
    },
    [setMarkerData],
  );

  // One-time map initialisation.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style: globeMapStyle(),
      center: GLOBE_INITIAL_CENTER,
      zoom: GLOBE_INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // Idle rotation: keep spinning between eased moves until the user grabs
    // the globe (mirrors Green Globe's behaviour). Wheel/keyboard zoom must
    // also count as interaction — otherwise every wheel-zoom `moveend`
    // restarts the spin's easeTo, which cancels the in-flight scroll-zoom
    // animation and locks the camera in a fight that feels like a freeze.
    let interacted = false;
    const continueSpin = () => spinGlobe(map, spinRef.current && !interacted);
    const stopSpin = () => {
      interacted = true;
    };
    map.on("moveend", continueSpin);
    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);
    map.on("wheel", stopSpin);
    map.on("keydown", stopSpin);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "globe-popup",
      offset: [0, -20],
    });

    map.on("load", () => {
      // Land cover raster below the place labels so they stay readable.
      if (!map.getSource(LANDCOVER_SOURCE)) {
        map.addSource(LANDCOVER_SOURCE, {
          type: "raster",
          tiles: [LANDCOVER_TILES_URL],
          tileSize: 256,
          attribution:
            '<a href="https://esa-worldcover.org/" target="_blank" rel="noreferrer">ESA WorldCover 2021</a>',
        });
        map.addLayer(
          {
            id: LANDCOVER_LAYER,
            type: "raster",
            source: LANDCOVER_SOURCE,
            layout: { visibility: "none" },
          },
          "ref-labels",
        );
      }

      // Site boundaries (all sites, green) + highlighted site (yellow).
      map.addSource(SITES_SOURCE, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: SITES_FILL_LAYER,
        type: "fill",
        source: SITES_SOURCE,
        paint: { "fill-color": "#00FF00", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: SITES_OUTLINE_LAYER,
        type: "line",
        source: SITES_SOURCE,
        paint: { "line-color": "#00FF00", "line-width": 3 },
      });
      // Point-style sites (bare coordinates) render as small green dots.
      map.addLayer({
        id: SITES_POINT_LAYER,
        type: "circle",
        source: SITES_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": "#00FF00",
          "circle-radius": 5,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.5,
        },
      });
      map.addSource(HIGHLIGHT_SOURCE, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: HIGHLIGHT_LAYER,
        type: "line",
        source: HIGHLIGHT_SOURCE,
        paint: { "line-color": "#FFEA00", "line-width": 3 },
      });

      // Measured trees (port of Green Globe's measured-trees source + layers):
      // pink clusters with counts; individual trees as small dots that grow
      // and recolour on hover.
      map.addSource(TREES_SOURCE, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 50,
      });
      map.addLayer({
        id: TREES_CLUSTER_LAYER,
        type: "circle",
        source: TREES_SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
          "circle-opacity": 0.5,
          "circle-color": "#ff77c1",
          "circle-stroke-color": "#ff77c1",
          "circle-stroke-opacity": 1,
        },
      });
      map.addLayer({
        id: TREES_CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: TREES_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Semibold"],
          "text-size": 12,
        },
      });
      map.addLayer({
        id: TREES_POINT_LAYER,
        type: "circle",
        source: TREES_SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#ec4899",
            ["boolean", ["feature-state", "hover"], false],
            "#0883fe",
            "#ff77c1",
          ],
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            10,
            ["boolean", ["feature-state", "hover"], false],
            8,
            4,
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1,
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#ffffff",
            "#000000",
          ],
        },
      });

      // Tree interactions: hover card on single trees, click a cluster to
      // zoom into it (mirrors Green Globe's behaviour).
      let hoveredTreeId: number | string | null = null;
      const clearTreeHover = () => {
        if (hoveredTreeId !== null) {
          map.setFeatureState({ source: TREES_SOURCE, id: hoveredTreeId }, { hover: false });
          hoveredTreeId = null;
        }
      };
      map.on("mousemove", TREES_POINT_LAYER, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        map.getCanvas().style.cursor = "pointer";
        if (feature.id !== hoveredTreeId) {
          clearTreeHover();
          if (feature.id !== undefined) {
            hoveredTreeId = feature.id;
            map.setFeatureState({ source: TREES_SOURCE, id: feature.id }, { hover: true });
          }
        }
        popup
          .setLngLat(feature.geometry.coordinates.slice(0, 2) as [number, number])
          .setDOMContent(treePopupContent(feature.properties ?? null))
          .addTo(map);
      });
      map.on("mouseleave", TREES_POINT_LAYER, () => {
        map.getCanvas().style.cursor = "";
        clearTreeHover();
        popup.remove();
      });
      // Click a single tree to open its detail sidebar; click the map away
      // from any tree to clear the selection.
      map.on("click", TREES_POINT_LAYER, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.id === undefined) return;
        event.preventDefault();
        selectTreeRef.current?.(treeDetail(feature.id, feature.properties ?? null));
      });
      map.on("click", (event: MapLayerMouseEvent) => {
        if (event.defaultPrevented) return;
        const hits = map.queryRenderedFeatures(event.point, { layers: [TREES_POINT_LAYER] });
        if (hits.length === 0) selectTreeRef.current?.(null);
      });
      map.on("mouseenter", TREES_CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", TREES_CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", TREES_CLUSTER_LAYER, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource(TREES_SOURCE) as GeoJSONSource | undefined;
        if (!source || typeof clusterId !== "number" || feature?.geometry.type !== "Point") return;
        const center = feature.geometry.coordinates.slice(0, 2) as [number, number];
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => map.easeTo({ center, zoom }))
          .catch(() => undefined);
      });

      // Organization markers: each org's own logo, cropped into a small
      // circular badge. Orgs without a resolvable avatar fall back to a
      // GainForest mark (or a Ma Earth mark for badge holders) at the same
      // compact size, drawn client-side so no extra pin assets are needed.
      map.addSource(MARKER_SOURCE, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      Promise.all([Promise.resolve(buildDefaultBadge()), loadHtmlImage(MA_EARTH_LOGO_URL).then((img) => buildCircleBadge(img, "cover"))])
        .then(([defaultBadge, maEarthBadge]) => {
          if (!map.hasImage(DEFAULT_BADGE_ID)) {
            map.addImage(DEFAULT_BADGE_ID, defaultBadge.image, { pixelRatio: defaultBadge.pixelRatio });
          }
          if (!map.hasImage(MA_EARTH_BADGE_ID)) {
            map.addImage(MA_EARTH_BADGE_ID, maEarthBadge.image, { pixelRatio: maEarthBadge.pixelRatio });
          }
          if (!map.getLayer(MARKER_LAYER)) {
            map.addLayer({
              id: MARKER_LAYER,
              type: "symbol",
              source: MARKER_SOURCE,
              layout: {
                "icon-image": ["get", "iconId"],
                "icon-size": 1,
                "icon-allow-overlap": true,
                "icon-anchor": "center",
              },
            });
          }
          // Any orgs whose source data was set before the layer/fallback
          // badges existed need their iconId re-resolved now that they do.
          setMarkerData();
        })
        .catch((error) => console.warn("[globe] marker badges failed", error));

      const handleMarkerMove = (event: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const coordinates = feature.geometry.coordinates.slice() as [number, number];
        while (Math.abs(event.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += event.lngLat.lng > coordinates[0] ? 360 : -360;
        }
        const name = String(feature.properties?.name ?? "");
        const country = feature.properties?.country ? String(feature.properties.country) : null;
        popup.setLngLat(coordinates).setDOMContent(popupContent(name, country)).addTo(map);
      };
      const handleMarkerLeave = () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      };
      const handleMarkerClick = (event: MapLayerMouseEvent) => {
        const did = event.features?.[0]?.properties?.did;
        if (typeof did === "string" && did) selectRef.current?.(did);
      };
      map.on("mousemove", MARKER_LAYER, handleMarkerMove);
      map.on("mouseleave", MARKER_LAYER, handleMarkerLeave);
      map.on("click", MARKER_LAYER, handleMarkerClick);

      setMapLoaded(true);
      loadedRef.current?.();
      continueSpin();
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      addedLayerIdsRef.current.clear();
      logoStatusRef.current.clear();
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the spin flag fresh and nudge the rotation when (re-)enabled.
  useEffect(() => {
    spinRef.current = spin;
    const map = mapRef.current;
    if (spin && map && mapLoaded) spinGlobe(map, true);
  }, [spin, mapLoaded]);

  // Organization markers: refresh the source, then lazily fetch + crop each
  // org's own logo into a badge (re-refreshing the source as each resolves).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    setMarkerData();
    for (const org of organizations) {
      if (typeof org.lat === "number" && typeof org.lon === "number") {
        void ensureOrgLogo(map, org.did);
      }
    }
  }, [organizations, mapLoaded, setMarkerData, ensureOrgLogo]);

  // Site boundaries + highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    (map.getSource(SITES_SOURCE) as GeoJSONSource | undefined)?.setData(
      sitesGeojson ?? EMPTY_FEATURE_COLLECTION,
    );
  }, [sitesGeojson, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    (map.getSource(HIGHLIGHT_SOURCE) as GeoJSONSource | undefined)?.setData(
      highlightGeojson ?? EMPTY_FEATURE_COLLECTION,
    );
  }, [highlightGeojson, mapLoaded]);

  // Measured trees of the focused organization.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    (map.getSource(TREES_SOURCE) as GeoJSONSource | undefined)?.setData(
      treesGeojson ?? EMPTY_FEATURE_COLLECTION,
    );
  }, [treesGeojson, mapLoaded]);

  // Highlight the actively selected tree (white ring), clearing the previous.
  const selectedTreeRef = useRef<string | number | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const previous = selectedTreeRef.current;
    if (previous !== null && previous !== selectedTreeId) {
      map.setFeatureState({ source: TREES_SOURCE, id: previous }, { selected: false });
    }
    if (selectedTreeId !== null) {
      map.setFeatureState({ source: TREES_SOURCE, id: selectedTreeId }, { selected: true });
    }
    selectedTreeRef.current = selectedTreeId;
  }, [selectedTreeId, treesGeojson, mapLoaded]);

  // Camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !bounds) return;
    map.fitBounds(bounds, {
      padding: {
        top: boundsPadding?.top ?? 96,
        bottom: boundsPadding?.bottom ?? 64,
        left: boundsPadding?.left ?? 64,
        right: boundsPadding?.right ?? 64,
      },
      maxZoom: 16,
      duration: 2200,
    });
    // boundsKey deliberately re-triggers the flight for repeat selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, boundsKey, mapLoaded]);

  // Land cover visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer(LANDCOVER_LAYER)) return;
    map.setLayoutProperty(LANDCOVER_LAYER, "visibility", landcoverVisible ? "visible" : "none");
  }, [landcoverVisible, mapLoaded]);

  // Dynamic data layers: diff the requested set against what is on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const wanted = new Map(activeLayers.map((layer) => [layer.id, layer]));
    const added = addedLayerIdsRef.current;

    for (const layerId of [...added]) {
      if (!wanted.has(layerId)) {
        removeDynamicLayer(map, layerId);
        added.delete(layerId);
      }
    }

    for (const layer of wanted.values()) {
      if (!added.has(layer.id)) {
        added.add(layer.id);
        void addDynamicLayer(map, layer).catch((error) => {
          console.warn("[globe] failed to add data layer", layer.name, error);
          added.delete(layer.id);
        });
      }
    }
  }, [activeLayers, mapLoaded]);

  return (
    <div
      ref={containerRef}
      data-testid="globe-map"
      className={cn(
        "h-full w-full bg-[#0b0b19] transition-opacity duration-700",
        mapLoaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
