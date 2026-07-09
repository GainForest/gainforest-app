"use client";

/**
 * GlobeExplorer — the full-page Green Globe experience, rebuilt natively on the
 * app's design system. Three modes share one component:
 *
 *   - global   (/globe):                    every organization on the planet,
 *                                           idle-spinning globe, search + data layers
 *   - organization (/globe/[identifier]):   zoomed to one org's project sites
 *   - project  (/globe/[identifier]/[rkey]): zoomed to a project's site boundaries
 *
 * Layout is responsive: floating glass panels on desktop, a collapsible bottom
 * sheet on mobile so the map stays front and center.
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  Building2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DroneIcon,
  EarthIcon,
  FolderKanbanIcon,
  HistoryIcon,
  LayersIcon,
  LeafIcon,
  LocateFixedIcon,
  MapPinnedIcon,
  MenuIcon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  TreePineIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMobileNav } from "../../_components/shell/mobile-nav-context";
import { countryFlag, countryName, formatCountry } from "../../_lib/format";
import { resolveCertifiedLocationCoords } from "../../_lib/coords";
import { TrustedByBadges } from "../../_components/TrustedByBadges";
import { GlobeMap } from "./GlobeMap";
import { LANDCOVER_LEGEND, ORG_LOCATION_COLOR, PROJECT_SITE_COLOR } from "../_lib/config";
import {
  fetchGlobeOrganizations,
  fetchGlobeTreeStats,
  fetchOrganizationLocationUri,
  fetchOrganizationSiteProjects,
  fetchOrganizationSites,
  fetchSiteGeoJson,
  filterPointsWithinBoundaries,
  geojsonBounds,
  mergeBounds,
  pointBounds,
  toFeatures,
} from "../_lib/data";
import {
  fetchGlobalLayers,
  fetchOrganizationLayerGroups,
  fetchOrganizationLayers,
} from "../_lib/layers";
import { buildDroneTimeSeries, type DroneTimeSeries } from "../_lib/time-series";
import { fetchOrganizationTrees, type TreeDetail } from "../_lib/trees";
import type {
  GlobeLayer,
  GlobeLayerGroup,
  GlobeOrganization,
  GlobeSite,
  LngLatBounds,
} from "../_lib/globe-types";

const WORLD_BOUNDS: LngLatBounds = [-150, -50, 150, 65];

/**
 * Elevation inside the overlay. The whole panel deliberately avoids hard
 * borders (only separators get those); a raised surface is expressed with two
 * cues instead — a faint white tint and a 1px inset top highlight, echoing the
 * layers cards. Reused everywhere so every elevated element reads the same.
 */
const ELEVATED = "bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]";

/**
 * Every floating surface except the docked left rail is a confined, outlined
 * glass card (the rail alone gets the feathered, borderless treatment so it
 * melts into the map). Kept in one place so the header, hover previews, mobile
 * sheet, time slider and tree card all read as the same material.
 */
const OUTLINE_SURFACE = "border border-white/10 bg-black/80 backdrop-blur-lg";

/** Height (px) of the mobile bottom sheet left visible in the "peek" snap —
 *  enough to reveal the grabber, search box and filter chips. */
const SHEET_PEEK = 184;
/** Height (px) at the lowest "collapsed" snap — just the grabber, so the map
 *  and its zoom controls are reachable underneath. */
const SHEET_COLLAPSED = 52;

type GlobeProjectFocus = {
  title: string;
  /** Project page to link back to. */
  href: string;
  /** Cert location AT-URIs (site boundaries). */
  locationUris: string[];
};

type GlobeExplorerProps = {
  /** Organization focus (org + project modes). */
  orgDid?: string | null;
  orgName?: string | null;
  /** handle-or-did used to build profile links for the focused org. */
  orgIdentifier?: string | null;
  project?: GlobeProjectFocus | null;
};

type GlobeMode = "global" | "organization" | "project";
type PanelVariant = "floating" | "sheet";
type OverlayTab = "details" | "layers";
/** Mobile bottom-sheet drag snap points ("collapsed" clears the map controls). */
type SheetSnap = "collapsed" | "peek" | "half" | "full";

type SiteState = {
  status: "idle" | "loading" | "ready";
  sites: GlobeSite[];
  features: GeoJSON.Feature[];
  bounds: LngLatBounds | null;
};

const EMPTY_SITE_STATE: SiteState = { status: "idle", sites: [], features: [], bounds: null };

function featureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

export function GlobeExplorer({ orgDid = null, orgName = null, orgIdentifier = null, project = null }: GlobeExplorerProps) {
  const t = useTranslations("marketplace.globe");
  const mode: GlobeMode = project ? "project" : orgDid ? "organization" : "global";

  // ── Organization roster ──────────────────────────────────────────────────
  const [organizations, setOrganizations] = useState<GlobeOrganization[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchGlobeOrganizations(controller.signal)
      .then((orgs) => setOrganizations(orgs.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[globe] organizations failed", error);
          setOrganizations([]);
        }
      });
    return () => controller.abort();
  }, []);

  // ── Selection (global mode uses the URL; focused modes are fixed) ────────
  const [queryOrg, setQueryOrg] = useQueryState("org", parseAsString);
  const focusDid = mode === "global" ? queryOrg : orgDid;
  const selectedOrg = useMemo(
    () => organizations?.find((org) => org.did === focusDid) ?? null,
    [organizations, focusDid],
  );
  const focusName = selectedOrg?.name ?? orgName ?? null;

  // Ma Earth roster filter (global mode). The flag arrives on the roster
  // itself — the API merges Ma Earth–badged organizations server-side.
  const [maEarthOnly, setMaEarthOnly] = useState(false);
  // Drone/data-layer roster filter (global mode). Layer counts arrive on the
  // roster too — the API counts each org's published map layers server-side.
  const [layersOnly, setLayersOnly] = useState(false);
  // Tree-data roster filter (global mode). Tree counts are not on the roster —
  // they come from /api/globe/trees, fetched lazily the first time the filter
  // is switched on.
  const [treesOnly, setTreesOnly] = useState(false);
  const [treeCounts, setTreeCounts] = useState<Map<string, number> | null>(null);
  const [treeCountsFailed, setTreeCountsFailed] = useState(false);
  useEffect(() => {
    if (!treesOnly || treeCounts !== null || treeCountsFailed) return;
    const controller = new AbortController();
    fetchGlobeTreeStats(controller.signal)
      .then((stats) => setTreeCounts(new Map(stats.map((stat) => [stat.did, stat.trees]))))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[globe] tree stats failed", error);
          setTreeCountsFailed(true);
        }
      });
    return () => controller.abort();
  }, [treesOnly, treeCounts, treeCountsFailed]);

  // ── Sites of the focused organization ────────────────────────────────────
  const [siteState, setSiteState] = useState<SiteState>(EMPTY_SITE_STATE);
  const [selectedSiteUri, setSelectedSiteUri] = useState<string | null>(null);
  const [boundsNonce, setBoundsNonce] = useState(0);
  const bumpBounds = useCallback(() => setBoundsNonce((n) => n + 1), []);

  useEffect(() => {
    setSelectedSiteUri(null);
    if (!focusDid || mode === "project") {
      setSiteState(EMPTY_SITE_STATE);
      return;
    }
    const controller = new AbortController();
    setSiteState({ ...EMPTY_SITE_STATE, status: "loading" });
    (async () => {
      const sites = await fetchOrganizationSites(focusDid, controller.signal);
      const features: GeoJSON.Feature[] = [];
      let bounds: LngLatBounds | null = null;
      await Promise.all(
        sites.map(async (site) => {
          if (site.geojsonUrl) {
            const geojson = await fetchSiteGeoJson(site.geojsonUrl, controller.signal).catch(() => null);
            if (geojson) {
              features.push(...toFeatures(geojson, { siteUri: site.uri }));
              bounds = mergeBounds(bounds, geojsonBounds(geojson));
              return;
            }
          }
          if (site.point) {
            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [site.point.lon, site.point.lat] },
              properties: { siteUri: site.uri },
            });
            bounds = mergeBounds(bounds, pointBounds(site.point.lat, site.point.lon));
          }
        }),
      );
      if (controller.signal.aborted) return;
      setSiteState({ status: "ready", sites, features, bounds });
      bumpBounds();
    })().catch((error) => {
      if ((error as Error).name !== "AbortError") {
        console.warn("[globe] sites failed", error);
        setSiteState({ status: "ready", sites: [], features: [], bounds: null });
      }
    });
    return () => controller.abort();
  }, [focusDid, mode, bumpBounds]);

  // ── The organization's own location (kept apart from the project sites) ──
  const [orgLocationUri, setOrgLocationUri] = useState<string | null>(null);
  useEffect(() => {
    setOrgLocationUri(null);
    if (!focusDid || mode === "project") return;
    const controller = new AbortController();
    fetchOrganizationLocationUri(focusDid, controller.signal)
      .then((uri) => {
        if (!controller.signal.aborted) setOrgLocationUri(uri);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[globe] org location failed", error);
        }
      });
    return () => controller.abort();
  }, [focusDid, mode]);

  // ── Which project(s) each site belongs to (tag pills in the site list) ──
  const [siteProjects, setSiteProjects] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    setSiteProjects(new Map());
    if (!focusDid || mode === "project") return;
    const controller = new AbortController();
    fetchOrganizationSiteProjects(focusDid, controller.signal)
      .then((map) => {
        if (!controller.signal.aborted) setSiteProjects(map);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[globe] site projects failed", error);
        }
      });
    return () => controller.abort();
  }, [focusDid, mode]);

  // ── Project boundaries (project mode) ────────────────────────────────────
  const [projectState, setProjectState] = useState<SiteState>(EMPTY_SITE_STATE);
  useEffect(() => {
    if (!project) {
      setProjectState(EMPTY_SITE_STATE);
      return;
    }
    const controller = new AbortController();
    setProjectState({ ...EMPTY_SITE_STATE, status: "loading" });
    (async () => {
      const features: GeoJSON.Feature[] = [];
      let bounds: LngLatBounds | null = null;
      await Promise.all(
        project.locationUris.map(async (uri) => {
          const resolved = await resolveCertifiedLocationCoords(uri, controller.signal).catch(() => null);
          if (!resolved) return;
          if (resolved.geojson) {
            features.push(...toFeatures(resolved.geojson, { siteUri: uri }));
            bounds = mergeBounds(bounds, geojsonBounds(resolved.geojson));
          } else {
            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [resolved.lon, resolved.lat] },
              properties: { siteUri: uri },
            });
            bounds = mergeBounds(bounds, pointBounds(resolved.lat, resolved.lon));
          }
        }),
      );
      if (controller.signal.aborted) return;
      setProjectState({ status: "ready", sites: [], features, bounds });
      bumpBounds();
    })().catch((error) => {
      if ((error as Error).name !== "AbortError") {
        console.warn("[globe] project boundaries failed", error);
        setProjectState({ status: "ready", sites: [], features: [], bounds: null });
      }
    });
    return () => controller.abort();
  }, [project, bumpBounds]);

  // ── Measured trees of the focused organization ─────────────────────────
  const [treesState, setTreesState] = useState<{
    status: "idle" | "loading" | "ready";
    data: GeoJSON.FeatureCollection | null;
  }>({ status: "idle", data: null });
  const [treesVisible, setTreesVisible] = useState(true);
  const [selectedTree, setSelectedTree] = useState<TreeDetail | null>(null);

  useEffect(() => {
    setTreesState({ status: "idle", data: null });
    setTreesVisible(true);
    setSelectedTree(null);
    // Tree data renders for any focused organization — the dedicated org/project
    // globe pages, and the global view once an org is selected/clicked.
    if (!focusDid) return;
    const controller = new AbortController();
    setTreesState({ status: "loading", data: null });
    fetchOrganizationTrees(focusDid, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setTreesState({ status: "ready", data });
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[globe] trees failed", error);
          setTreesState({ status: "ready", data: null });
        }
      });
    return () => controller.abort();
  }, [focusDid, mode]);

  // ── Data layers ──────────────────────────────────────────────────────────
  const [globalLayers, setGlobalLayers] = useState<GlobeLayer[] | null>(null);
  const [orgLayers, setOrgLayers] = useState<GlobeLayer[]>([]);
  const [orgLayerGroups, setOrgLayerGroups] = useState<GlobeLayerGroup[]>([]);
  const [orgLayersLoading, setOrgLayersLoading] = useState(false);
  const [enabledLayerIds, setEnabledLayerIds] = useState<Set<string>>(new Set());
  const [landcoverVisible, setLandcoverVisible] = useState(false);
  const [activeOverlayTab, setActiveOverlayTab] = useState<OverlayTab>("details");
  // Drone time-series slider: which series is active, current stop, autoplay.
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [seriesStep, setSeriesStep] = useState(0);
  const [seriesPlaying, setSeriesPlaying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchGlobalLayers(controller.signal)
      .then(setGlobalLayers)
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.warn("[globe] global layers failed", error);
          setGlobalLayers([]);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setOrgLayers([]);
    setOrgLayerGroups([]);
    setActiveSeriesId(null);
    setSeriesPlaying(false);
    if (!focusDid) return;
    const controller = new AbortController();
    setOrgLayersLoading(true);
    Promise.all([
      fetchOrganizationLayers(focusDid, controller.signal),
      // Declared monitored areas — tolerated as empty on failure so a broken
      // group listing never hides the layers themselves.
      fetchOrganizationLayerGroups(focusDid, controller.signal).catch(() => []),
    ])
      .then(([layers, groups]) => {
        setOrgLayers(layers);
        setOrgLayerGroups(groups);
        // Layers flagged as default for this org start visible.
        const defaults = layers.filter((layer) => layer.isDefault).map((layer) => layer.id);
        if (defaults.length > 0) {
          setEnabledLayerIds((current) => new Set([...current, ...defaults]));
        }
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") console.warn("[globe] org layers failed", error);
      })
      .finally(() => setOrgLayersLoading(false));
    return () => controller.abort();
  }, [focusDid]);

  // ── Drone time series (repeat flights over the same area) ──────────────
  // Overlapping drone imagery is grouped into per-area series; enabling one
  // swaps the individual layer toggles for a time slider on the map.
  const droneSeries = useMemo(
    () => buildDroneTimeSeries(orgLayers, orgLayerGroups),
    [orgLayers, orgLayerGroups],
  );
  const seriesLayerIds = useMemo(
    () => new Set(droneSeries.flatMap((series) => series.layers.map((layer) => layer.id))),
    [droneSeries],
  );
  const activeSeries = useMemo(
    () => droneSeries.find((series) => series.id === activeSeriesId) ?? null,
    [droneSeries, activeSeriesId],
  );

  // Series members never participate in the plain per-layer toggles — the
  // slider owns them. Strip any that slipped in (e.g. record defaults).
  useEffect(() => {
    if (seriesLayerIds.size === 0) return;
    setEnabledLayerIds((current) => {
      const next = new Set([...current].filter((id) => !seriesLayerIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [seriesLayerIds]);

  // Auto-advance while playing (loops).
  useEffect(() => {
    if (!seriesPlaying || !activeSeries) return;
    const timer = setInterval(() => {
      setSeriesStep((step) => (step + 1) % activeSeries.steps.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [seriesPlaying, activeSeries]);

  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);

  // Layer flights: when a layer with a declared footprint becomes visible the
  // camera flies straight to it, so it is always clear which toggle just
  // changed the map. The nonce re-triggers the flight on repeat requests.
  const [layerFlightNonce, setLayerFlightNonce] = useState(0);
  const flyToLayer = useCallback((layer: GlobeLayer) => {
    if (!layer.bounds) return;
    setMapBounds(layer.bounds);
    setLayerFlightNonce((nonce) => nonce + 1);
  }, []);

  const toggleLayer = useCallback(
    (layer: GlobeLayer) => {
      const enabling = !enabledLayerIds.has(layer.id);
      setEnabledLayerIds((current) => {
        const next = new Set(current);
        if (next.has(layer.id)) next.delete(layer.id);
        else next.add(layer.id);
        return next;
      });
      if (enabling) flyToLayer(layer);
    },
    [enabledLayerIds, flyToLayer],
  );

  // "Zoom to layer": make sure the layer is visible, then fly to it.
  const locateLayer = useCallback(
    (layer: GlobeLayer) => {
      setEnabledLayerIds((current) =>
        current.has(layer.id) ? current : new Set([...current, layer.id]),
      );
      flyToLayer(layer);
    },
    [flyToLayer],
  );

  const flyToSeries = useCallback((series: DroneTimeSeries) => {
    setMapBounds(series.bounds);
    setLayerFlightNonce((nonce) => nonce + 1);
  }, []);

  /** Turn a drone time series on (starting at its latest capture) or off. */
  const toggleSeries = useCallback(
    (series: DroneTimeSeries) => {
      setSeriesPlaying(false);
      if (activeSeriesId === series.id) {
        setActiveSeriesId(null);
        return;
      }
      setActiveSeriesId(series.id);
      setSeriesStep(series.steps.length - 1);
      flyToSeries(series);
    },
    [activeSeriesId, flyToSeries],
  );

  /** Jump straight to one capture date (activates the series if needed). */
  const selectSeriesStep = useCallback(
    (series: DroneTimeSeries, step: number) => {
      setSeriesPlaying(false);
      setSeriesStep(step);
      if (activeSeriesId !== series.id) {
        setActiveSeriesId(series.id);
        flyToSeries(series);
      }
    },
    [activeSeriesId, flyToSeries],
  );

  const toggleSeriesPlayback = useCallback(() => {
    if (!activeSeries) return;
    if (seriesPlaying) {
      setSeriesPlaying(false);
      return;
    }
    // Restart from the oldest capture when play is pressed at the end.
    setSeriesStep((step) => (step >= activeSeries.steps.length - 1 ? 0 : step));
    setSeriesPlaying(true);
  }, [activeSeries, seriesPlaying]);

  const categorizedGlobalLayers = useMemo(() => {
    const categories = new Map<string, GlobeLayer[]>();
    for (const layer of globalLayers ?? []) {
      const list = categories.get(layer.category) ?? [];
      list.push(layer);
      categories.set(layer.category, list);
    }
    return [...categories.entries()];
  }, [globalLayers]);

  // Individually toggled layers (series members excluded — the slider owns
  // them), plus every member of the active series so steps swap instantly.
  const looseLayers = useMemo(
    () =>
      [...(globalLayers ?? []), ...orgLayers].filter(
        (layer) => enabledLayerIds.has(layer.id) && !seriesLayerIds.has(layer.id),
      ),
    [globalLayers, orgLayers, enabledLayerIds, seriesLayerIds],
  );
  const activeLayers = useMemo(
    () => (activeSeries ? [...looseLayers, ...activeSeries.layers] : looseLayers),
    [looseLayers, activeSeries],
  );
  // Only the current capture date is opaque; the rest stay mounted at 0 so
  // dragging the slider crossfades instead of refetching tiles.
  const layerOpacities = useMemo(() => {
    if (!activeSeries) return undefined;
    const visible = new Set(activeSeries.steps[seriesStep]?.layerIds ?? []);
    return Object.fromEntries(
      activeSeries.layers.map((layer) => [layer.id, visible.has(layer.id) ? 1 : 0]),
    );
  }, [activeSeries, seriesStep]);
  // Series members are pulled out of the flat per-layer toggle list — they
  // render as one grouped time-series card instead.
  const nonSeriesOrgLayers = useMemo(
    () => orgLayers.filter((layer) => !seriesLayerIds.has(layer.id)),
    [orgLayers, seriesLayerIds],
  );
  const activeLegends = useMemo(
    () => activeLayers.filter((layer) => (layer.legend?.length ?? 0) > 0),
    [activeLayers],
  );

  // ── Derived map inputs ───────────────────────────────────────────────────
  const focusedState = mode === "project" ? projectState : siteState;
  const visibleOrganizations = useMemo(() => {
    if (!organizations) return [];
    // Focused pages show only their own subject: the org page keeps just that
    // org's marker, the project page shows nothing but its own boundaries.
    if (mode === "organization") return organizations.filter((org) => org.did === focusDid);
    if (mode === "project") return [];
    let list = organizations;
    if (maEarthOnly) list = list.filter((org) => org.maEarth === true);
    if (layersOnly) list = list.filter((org) => (org.dataLayers ?? 0) > 0);
    if (treesOnly) list = list.filter((org) => (treeCounts?.get(org.did) ?? 0) > 0);
    return list;
  }, [organizations, mode, focusDid, maEarthOnly, layersOnly, treesOnly, treeCounts]);

  // The project page only shows the trees that fall inside the project's own
  // boundaries — the org-wide tree file covers every project of the org.
  const visibleTrees = useMemo(() => {
    if (!treesState.data) return null;
    if (mode !== "project") return treesState.data;
    if (projectState.status !== "ready") return null;
    return filterPointsWithinBoundaries(treesState.data, projectState.features);
  }, [treesState.data, mode, projectState]);

  const highlightFeatures = useMemo(() => {
    if (!selectedSiteUri) return [];
    return focusedState.features.filter((feature) => feature.properties?.siteUri === selectedSiteUri);
  }, [focusedState.features, selectedSiteUri]);

  // Stable GeoJSON identities — building these inline in JSX gave the map a
  // new object every render, forcing redundant setData round-trips. Features
  // of the org's own location are tagged so the map can paint them apart.
  const sitesCollection = useMemo(() => {
    if (!orgLocationUri) return featureCollection(focusedState.features);
    return featureCollection(
      focusedState.features.map((feature) =>
        feature.properties?.siteUri === orgLocationUri
          ? { ...feature, properties: { ...feature.properties, siteKind: "organization" } }
          : feature,
      ),
    );
  }, [focusedState.features, orgLocationUri]);
  const highlightCollection = useMemo(
    () => featureCollection(highlightFeatures),
    [highlightFeatures],
  );

  useEffect(() => {
    if (!focusDid && mode === "global") return;
    if (selectedSiteUri) {
      const bounds = geojsonBounds(featureCollection(highlightFeatures));
      if (bounds) {
        setMapBounds(bounds);
        return;
      }
    }
    if (focusedState.status !== "ready") return;
    if (focusedState.bounds) {
      setMapBounds(focusedState.bounds);
    } else if (selectedOrg && typeof selectedOrg.lat === "number" && typeof selectedOrg.lon === "number") {
      setMapBounds(pointBounds(selectedOrg.lat, selectedOrg.lon, 0.5));
    }
    // boundsNonce re-fits on repeat selections of the same org/site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDid, mode, focusedState, selectedSiteUri, highlightFeatures, selectedOrg, boundsNonce]);

  // Extra camera padding so fitted sites are not hidden under the side panel
  // (desktop) or the bottom sheet (mobile).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // ── Mobile bottom sheet + map readiness ──────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  // Mobile bottom sheet: draggable between three snaps (Google-Maps style).
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  // Bumped to focus the roster search box when the quick-search button is hit.
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);
  // Desktop: whether the docked left overlay is pinned open. The header nav is
  // the switcher — clicking a nav item pins its panel; clicking the active one
  // again dismisses the overlay (back to a clean map + hover previews).
  const [railOpen, setRailOpen] = useState(true);
  const selectNav = useCallback(
    (tab: OverlayTab) => {
      setRailOpen((open) => !(open && tab === activeOverlayTab));
      setActiveOverlayTab(tab);
    },
    [activeOverlayTab],
  );
  const collapseSheet = useCallback(() => setSheetSnap("peek"), []);

  // Collapse the sheet whenever the focus changes so the flight is visible.
  useEffect(() => {
    setSheetSnap("peek");
  }, [focusDid]);

  // Drop any open tree card when trees are hidden or the org changes.
  useEffect(() => {
    if (!treesVisible) setSelectedTree(null);
  }, [treesVisible]);

  const selectOrganization = useCallback(
    (did: string | null) => {
      if (mode !== "global") return;
      setSelectedSiteUri(null);
      if (!did) {
        void setQueryOrg(null);
        setMapBounds(WORLD_BOUNDS);
        bumpBounds();
        return;
      }
      void setQueryOrg(did);
      bumpBounds();
    },
    [mode, setQueryOrg, bumpBounds],
  );

  const selectSite = useCallback(
    (uri: string | null) => {
      setSelectedSiteUri(uri);
      bumpBounds();
    },
    [bumpBounds],
  );

  // Mobile quick-search: clear any focused org so the roster (with its search
  // box) is showing, expand the sheet, and focus the input.
  const openMobileSearch = useCallback(() => {
    setActiveOverlayTab("details");
    if (mode === "global") selectOrganization(null);
    setSheetSnap("full");
    setSearchFocusNonce((n) => n + 1);
  }, [mode, selectOrganization]);

  // Shared panel props.
  const globalPanelProps = {
    autoFocusNonce: searchFocusNonce,
    organizations,
    visibleOrganizations,
    maEarthOnly,
    onToggleMaEarth: () => setMaEarthOnly((value) => !value),
    layersOnly,
    onToggleLayersOnly: () => setLayersOnly((value) => !value),
    treesOnly,
    onToggleTrees: () => setTreesOnly((value) => !value),
    treeCounts,
    treeCountsLoading: treesOnly && treeCounts === null && !treeCountsFailed,
    treeCountsFailed,
    onSelect: (did: string) => {
      selectOrganization(did);
      collapseSheet();
    },
  };

  const focusPanelProps = focusDid
    ? {
        mode,
        focusDid,
        focusName,
        orgIdentifier: mode === "global" ? focusDid : orgIdentifier ?? focusDid,
        selectedOrg,
        project,
        state: focusedState,
        siteProjects,
        orgLocationUri,
        selectedSiteUri,
        onSelectSite: (uri: string | null) => {
          selectSite(uri);
          collapseSheet();
        },
        onClear: mode === "global" ? () => selectOrganization(null) : undefined,
        onRefit: () => {
          bumpBounds();
          collapseSheet();
        },
      }
    : null;

  const layersPanelProps = {
    landcoverVisible,
    onToggleLandcover: () => setLandcoverVisible((value) => !value),
    categorizedGlobalLayers,
    globalLayersLoading: globalLayers === null,
    orgLayers: nonSeriesOrgLayers,
    orgLayersLoading,
    showOrgLayers: Boolean(focusDid),
    enabledLayerIds,
    onToggleLayer: toggleLayer,
    onLocateLayer: locateLayer,
    droneSeries,
    activeSeriesId,
    activeSeriesStep: seriesStep,
    onToggleSeries: toggleSeries,
    onSelectSeriesStep: selectSeriesStep,
    onLocateSeries: flyToSeries,
    treesCount: visibleTrees?.features.length ?? 0,
    treesLoading: treesState.status === "loading",
    treesVisible,
    onToggleTrees: () => setTreesVisible((value) => !value),
    visibleLayers: looseLayers,
    legendLayers: activeLegends,
  };

  // Header title (mobile). A null title means the roster is still loading
  // (hard refresh of /globe?org=…).
  const sheetTitle = focusDid ? (mode === "project" ? project?.title ?? null : focusName) : t("title");

  // One place that maps a tab → its panel, shared by the docked rail, the
  // header hover previews, and the mobile sheet so they never drift.
  const renderPanel = useCallback(
    (tab: OverlayTab, variant: PanelVariant) =>
      tab === "layers" ? (
        <LayersPanel {...layersPanelProps} />
      ) : focusPanelProps ? (
        <FocusPanel variant={variant} {...focusPanelProps} />
      ) : (
        <GlobalPanel variant={variant} {...globalPanelProps} />
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layersPanelProps, focusPanelProps, globalPanelProps],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="dark globe-glass absolute inset-0 overflow-hidden bg-[#0b0b19]" data-testid="globe-explorer">
      <GlobeMap
        className="absolute inset-0"
        organizations={visibleOrganizations}
        onSelectOrganization={(did) => selectOrganization(did)}
        sitesGeojson={sitesCollection}
        highlightGeojson={highlightCollection}
        treesGeojson={treesVisible ? visibleTrees : null}
        onSelectTree={setSelectedTree}
        selectedTreeId={selectedTree?.id ?? null}
        bounds={mapBounds}
        boundsKey={`${focusDid ?? "none"}:${selectedSiteUri ?? "all"}:${boundsNonce}:layer${layerFlightNonce}`}
        boundsPadding={
          isDesktop
            ? { top: 48, bottom: 64, left: 416, right: 64 }
            : { top: 36, bottom: 150, left: 36, right: 36 }
        }
        spin={mode === "global" && !focusDid}
        landcoverVisible={landcoverVisible}
        activeLayers={activeLayers}
        layerOpacities={layerOpacities}
        onLoaded={() => setMapReady(true)}
      />

      {/* Loading veil while the globe boots. */}
      <AnimatePresence>
        {!mapReady ? (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#0b0b19]"
          >
            <div className="flex flex-col items-center gap-3">
              <span className="relative grid size-14 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <EarthIcon className="size-7 text-primary" />
              </span>
              <p className="text-sm font-medium text-white/60">{t("loadingGlobe")}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Selected tree detail (right sidebar) ── */}
      <AnimatePresence>
        {selectedTree ? (
          <TreeDetailPanel
            key={String(selectedTree.id)}
            tree={selectedTree}
            onClose={() => setSelectedTree(null)}
          />
        ) : null}
      </AnimatePresence>

      {/* ── Top header: nav back into the app + panel switcher ── */}
      <GlobeHeader
        title={sheetTitle ?? t("title")}
        activeTab={activeOverlayTab}
        railOpen={railOpen}
        onSelectNav={selectNav}
        onCloseRail={() => setRailOpen(false)}
        renderPanel={renderPanel}
        sheetFull={sheetSnap === "full"}
        onCollapseSheet={() => setSheetSnap("peek")}
      />

      {/* ── Desktop: docked left overlay (pinned by the header nav) ── */}
      <AnimatePresence>
        {railOpen ? (
          <motion.section
            key="globe-rail"
            data-testid="globe-desktop-panel"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.26, ease: [0.25, 0.1, 0.25, 1] }}
            // `.globe-feathered-panel` forces position:relative (so its ::before
            // can anchor), which would beat Tailwind's `absolute` and collapse
            // the rail to its content height — pin it full-height inline instead.
            style={{ width: "min(460px, calc(100vw - 3rem))", position: "absolute", top: 0, bottom: 0, left: 0 }}
            className="globe-feathered-panel globe-feathered-panel--left-rail pointer-events-auto z-10 hidden max-w-[460px] flex-col overflow-hidden pt-16 shadow-xl md:flex"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeOverlayTab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  {renderPanel(activeOverlayTab, "floating")}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* ── Mobile: draggable bottom sheet + its floating options rail ── */}
      <div className="md:hidden">
        <MobileSheet
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          activeTab={activeOverlayTab}
          onSelectTab={setActiveOverlayTab}
          onSearch={openMobileSearch}
          renderPanel={renderPanel}
        />
      </div>

      {/* ── Drone time slider (active series) ── */}
      <AnimatePresence>
        {activeSeries ? (
          <TimeSliderCard
            key={activeSeries.id}
            series={activeSeries}
            step={seriesStep}
            playing={seriesPlaying}
            onStepChange={(step) => {
              setSeriesPlaying(false);
              setSeriesStep(step);
            }}
            onTogglePlay={toggleSeriesPlayback}
            onLocate={() => flyToSeries(activeSeries)}
            onClose={() => toggleSeries(activeSeries)}
          />
        ) : null}
      </AnimatePresence>

    </div>
  );
}

// ── Top header ──────────────────────────────────────────────────────────────

/** Panel switcher entries — shared by the desktop header nav and the mobile
 *  bottom-sheet tabs so the two stay in lockstep. */
const NAV_ITEMS: Array<{ id: OverlayTab; labelKey: "tabs.details" | "tabs.layers"; icon: LucideIcon }> = [
  { id: "details", labelKey: "tabs.details", icon: Building2Icon },
  { id: "layers", labelKey: "tabs.layers", icon: LayersIcon },
];

/**
 * Floating top-left header. On mobile it is a hamburger back into the app's
 * nav drawer (the Globe hides the shell header, so this is the only way out on
 * small screens) plus the section title. On desktop it is the panel switcher:
 * hovering an item previews its panel, clicking pins it to the docked left
 * overlay — and clicking the pinned item again dismisses the overlay.
 */
function GlobeHeader({
  title,
  activeTab,
  railOpen,
  onSelectNav,
  onCloseRail,
  renderPanel,
  sheetFull,
  onCollapseSheet,
}: {
  title: string;
  activeTab: OverlayTab;
  railOpen: boolean;
  onSelectNav: (tab: OverlayTab) => void;
  /** Desktop: deactivate the pinned tab (close the docked rail). */
  onCloseRail: () => void;
  renderPanel: (tab: OverlayTab, variant: PanelVariant) => React.ReactNode;
  /** Mobile: the sheet is fully expanded — offer a collapse affordance. */
  sheetFull: boolean;
  onCollapseSheet: () => void;
}) {
  const t = useTranslations("marketplace.globe");
  const nav = useTranslations("common.navigation");
  const mobileNav = useMobileNav();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
      {/* No backdrop-blur here: a blurred ancestor would become the backdrop
          root and kill the hover-preview card's own blur. Solid glass is fine
          for a slim bar. */}
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/80 p-1 shadow-lg">
        {/* Mobile left cluster: a full sheet turns the hamburger + title into a
            single "collapse" chevron so the sheet can be dismissed. */}
        {sheetFull ? (
          <button
            type="button"
            onClick={onCollapseSheet}
            aria-label={t("sheet.collapse")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-white/[0.12] md:hidden"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => mobileNav?.open()}
              aria-label={nav("openNavigation")}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-foreground md:hidden"
            >
              <MenuIcon className="size-4" />
            </button>
            <span className="max-w-[52vw] truncate px-2 text-sm font-semibold text-foreground md:hidden">
              {title}
            </span>
          </>
        )}
        {/* Panel switcher — desktop only (mobile drives it from the bottom sheet) */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <HeaderNavItem
              key={item.id}
              label={t(item.labelKey)}
              icon={item.icon}
              active={railOpen && activeTab === item.id}
              onSelect={() => onSelectNav(item.id)}
              renderPanel={() => renderPanel(item.id, "floating")}
            />
          ))}
          {/* Close the pinned tab (desktop). */}
          {railOpen ? (
            <button
              type="button"
              onClick={onCloseRail}
              aria-label={t("tree.close")}
              title={t("tree.close")}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One header nav item: a pill that previews its panel in a floating card
 *  while hovered (only when it is not the pinned/active item) and pins it on
 *  click. The card and the pill share one hover region so moving between them
 *  keeps the preview open. */
function HeaderNavItem({
  label,
  icon: Icon,
  active,
  onSelect,
  renderPanel,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
  renderPanel: () => React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  // Mounting the preview renders the (heavy) panel — e.g. the 800+ org roster.
  // Doing it as a transition lets the pill's own hover state paint immediately
  // instead of the whole frame stalling behind the panel render.
  const [, startPreview] = useTransition();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(false), 120);
  }, [cancelClose]);
  useEffect(() => cancelClose, [cancelClose]);

  // The preview never competes with the pinned overlay: only shows when this
  // item is not the active one.
  const showPreview = hovered && !active;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        startPreview(() => setHovered(true));
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => {
          cancelClose();
          setHovered(false);
          onSelect();
        }}
        aria-pressed={active}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
          active ? "bg-white/[0.12] text-foreground" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        )}
      >
        <Icon className={cn("size-3.5", active && "text-primary")} />
        {label}
      </button>
      <AnimatePresence>
        {showPreview ? (
          // Fade only — a `transform` on this ancestor (e.g. a slide) would
          // disable the card's backdrop-filter in Chrome, killing the blur.
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
            // top-full + padding keeps a continuous hover bridge to the pill.
            className="absolute left-0 top-full z-40 pt-2"
          >
            <div className={cn("flex h-[min(66vh,600px)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl shadow-xl", OUTLINE_SURFACE)}>
              {renderPanel()}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Mobile: floating tab switcher + draggable bottom sheet ──────────────────

const SHEET_SPRING = { type: "spring" as const, stiffness: 420, damping: 42 };
/** Snaps ordered top → bottom, for nearest/fling resolution. */
const SHEET_SNAPS: SheetSnap[] = ["full", "half", "peek", "collapsed"];

/** Google-Maps-style draggable bottom sheet plus its floating options rail.
 *  Drag the grabber between four snaps (collapsed / peek / half / full); the
 *  lowest clears the map's zoom controls. The options rail (search + tab
 *  switch) rides just above the sheet's top edge so it's always reachable. */
function MobileSheet({
  snap,
  onSnapChange,
  activeTab,
  onSelectTab,
  onSearch,
  renderPanel,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  activeTab: OverlayTab;
  onSelectTab: (tab: OverlayTab) => void;
  onSearch: () => void;
  renderPanel: (tab: OverlayTab, variant: PanelVariant) => React.ReactNode;
}) {
  const t = useTranslations("marketplace.globe");
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  // Distinguishes a real drag from a plain tap on the grabber so the click
  // handler doesn't also fire after a drag gesture.
  const dragged = useRef(false);

  const [vh, setVh] = useState(0);
  useEffect(() => {
    const measure = () => setVh(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fullH = vh ? Math.round(vh * 0.92) : 0;
  const halfH = vh ? Math.round(vh * 0.52) : 0;
  const targetY = useCallback(
    (s: SheetSnap) => {
      if (!fullH) return 0;
      if (s === "full") return 0;
      if (s === "half") return fullH - halfH;
      if (s === "peek") return fullH - SHEET_PEEK;
      return fullH - SHEET_COLLAPSED;
    },
    [fullH, halfH],
  );
  const maxY = fullH ? fullH - SHEET_COLLAPSED : 0;

  // Settle to the active snap whenever it (or the viewport) changes. The first
  // settle jumps (no animation) so the sheet never flashes fully-open on boot.
  const settled = useRef(false);
  useEffect(() => {
    if (!fullH) return;
    const target = targetY(snap);
    if (!settled.current) {
      settled.current = true;
      y.set(target);
      return;
    }
    const controls = animate(y, target, SHEET_SPRING);
    return () => controls.stop();
  }, [snap, fullH, halfH, targetY, y]);

  const handleDragEnd = (_: unknown, info: { velocity: { y: number } }) => {
    const current = y.get();
    const v = info.velocity.y;
    const index = SHEET_SNAPS.indexOf(snap);
    let next: SheetSnap;
    if (v < -350) next = SHEET_SNAPS[Math.max(0, index - 1)]!; // fling up → higher
    else if (v > 350) next = SHEET_SNAPS[Math.min(SHEET_SNAPS.length - 1, index + 1)]!; // fling down → lower
    else {
      next = SHEET_SNAPS.reduce((best, s) =>
        Math.abs(targetY(s) - current) < Math.abs(targetY(best) - current) ? s : best,
      );
    }
    if (next === snap) animate(y, targetY(snap), SHEET_SPRING);
    else onSnapChange(next);
  };

  // The options rail rides just above the sheet's top edge. Positioned via
  // `bottom` (not transform) so its own backdrop-blur keeps working — a
  // transformed ancestor would disable it. Fades out as the sheet nears full.
  const railBottom = useTransform(y, (v) => (fullH ? fullH - v + 12 : SHEET_PEEK + 12));
  // Visible through the peek↔half range; fades out toward "full" (would hit the
  // header) and toward "collapsed" (would clash with the map's zoom controls).
  const railOpacity = useTransform(y, (v) => {
    if (!fullH) return 1;
    const peekY = fullH - SHEET_PEEK;
    const collapsedY = fullH - SHEET_COLLAPSED;
    if (v <= 0) return 0;
    if (v < 64) return v / 64;
    if (v <= peekY) return 1;
    if (v >= collapsedY) return 0;
    return 1 - (v - peekY) / (collapsedY - peekY);
  });
  const railPointer = useTransform(railOpacity, (o) => (o < 0.5 ? "none" : "auto"));
  const others = NAV_ITEMS.filter((item) => item.id !== activeTab);

  return (
    <>
      {/* Floating options rail — search + quick tab switch, riding the sheet. */}
      <motion.div
        style={{ bottom: railBottom, opacity: railOpacity, pointerEvents: railPointer }}
        className="absolute right-3 z-20 flex flex-col items-end gap-2"
      >
        <div className="flex gap-2 rounded-full border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-lg">
          <button
            type="button"
            onClick={onSearch}
            aria-label={t("panel.searchPlaceholder")}
            className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-white/[0.12]"
          >
            <SearchIcon className="size-4" />
          </button>
          {others.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-label={t(labelKey)}
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-white/[0.12]"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </motion.div>

      <motion.section
        aria-label={t("title")}
        data-testid="globe-sheet"
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: maxY }}
        dragElastic={0.06}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={handleDragEnd}
        style={{ y, height: fullH || undefined }}
        className={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-b-0 shadow-[0_-8px_32px_rgb(0_0_0/0.25)]",
          !fullH && "h-[62dvh]",
          OUTLINE_SURFACE,
        )}
      >
        {/* Grabber — the only drag surface, so the list below scrolls freely.
            Tapping it (no drag) steps the sheet through its snaps. */}
        <div
          onPointerDown={(event) => {
            dragged.current = false;
            dragControls.start(event);
          }}
          onClick={() => {
            if (dragged.current) return;
            onSnapChange(snap === "full" ? "peek" : snap === "peek" ? "half" : "full");
          }}
          role="button"
          tabIndex={0}
          aria-label={t("sheet.expand")}
          className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-white/25" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {renderPanel(activeTab, "sheet")}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.section>
    </>
  );
}

// ── Global mode: search + roster ───────────────────────────────────────────

function GlobalPanel({
  variant,
  autoFocusNonce,
  organizations,
  visibleOrganizations,
  maEarthOnly,
  onToggleMaEarth,
  layersOnly,
  onToggleLayersOnly,
  treesOnly,
  onToggleTrees,
  treeCounts,
  treeCountsLoading,
  treeCountsFailed,
  onSelect,
}: {
  variant: PanelVariant;
  /** Bumped from outside (mobile quick-search) to focus the search box. */
  autoFocusNonce?: number;
  organizations: GlobeOrganization[] | null;
  visibleOrganizations: GlobeOrganization[];
  maEarthOnly: boolean;
  onToggleMaEarth: () => void;
  layersOnly: boolean;
  onToggleLayersOnly: () => void;
  treesOnly: boolean;
  onToggleTrees: () => void;
  /** did → measured-tree count, once loaded (null before the first toggle). */
  treeCounts: Map<string, number> | null;
  treeCountsLoading: boolean;
  treeCountsFailed: boolean;
  onSelect: (did: string) => void;
}) {
  const t = useTranslations("marketplace.globe");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusNonce) inputRef.current?.focus();
  }, [autoFocusNonce]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleOrganizations;
    return visibleOrganizations.filter((org) => org.name.toLowerCase().includes(q));
  }, [visibleOrganizations, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex flex-col gap-2 px-4", variant === "floating" ? "py-4" : "py-3")}>
        <div className="relative min-w-0">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("panel.searchPlaceholder")}
            className="h-9 w-full rounded-full bg-white/[0.06] pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:bg-white/[0.12]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMaEarth}
            aria-pressed={maEarthOnly}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
              maEarthOnly
                ? "bg-primary/10 text-primary"
                : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.12] hover:text-primary",
            )}
          >
            <Image
              src="/assets/media/images/badges/ma-earth-logo.webp"
              alt=""
              width={14}
              height={14}
              className="size-3.5 rounded-full"
            />
            {t("panel.maEarth")}
          </button>
          <button
            type="button"
            onClick={onToggleLayersOnly}
            aria-pressed={layersOnly}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
              layersOnly
                ? "bg-primary/10 text-primary"
                : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.12] hover:text-primary",
            )}
          >
            <DroneIcon className="size-3.5" />
            {t("panel.dataFilter")}
          </button>
          <button
            type="button"
            onClick={onToggleTrees}
            aria-pressed={treesOnly}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
              treesOnly
                ? "bg-primary/10 text-primary"
                : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.12] hover:text-primary",
            )}
          >
            <TreePineIcon className="size-3.5" />
            {t("panel.treeFilter")}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        {variant === "floating" ? (
          <p className="px-4 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {organizations === null || treeCountsLoading
              ? t("panel.loading")
              : t("panel.count", { count: filtered.length })}
          </p>
        ) : null}
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {organizations === null || treeCountsLoading ? (
              <li className="flex flex-col gap-2 px-4 py-2">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-3/4 rounded-lg" />
              </li>
            ) : treesOnly && treeCountsFailed ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t("panel.treesFailed")}</li>
            ) : filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                {treesOnly && !query.trim() ? t("panel.treesEmpty") : t("panel.empty")}
              </li>
            ) : (
              filtered.map((org) => (
                <li key={org.did}>
                  <button
                    type="button"
                    onClick={() => onSelect(org.did)}
                    className="group flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-base">
                      {(org.country ? countryFlag(org.country) : "") || "🌍"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:text-primary">
                        <span className="truncate">{org.name}</span>
                        {org.maEarth ? (
                          <Image
                            src="/assets/media/images/badges/ma-earth-logo.webp"
                            alt="Ma Earth"
                            title="Ma Earth"
                            width={14}
                            height={14}
                            className="size-3.5 shrink-0 rounded-full"
                          />
                        ) : null}
                      </span>
                      {org.country ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {/* Name only — the row's avatar circle is already the flag. */}
                          {countryName(org.country)}
                        </span>
                      ) : null}
                    </span>
                    {treesOnly && (treeCounts?.get(org.did) ?? 0) > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        <TreePineIcon className="size-3" />
                        {t("layers.measuredTreesCount", { count: treeCounts?.get(org.did) ?? 0 })}
                      </span>
                    ) : (org.dataLayers ?? 0) > 0 ? (
                      <span
                        title={t("panel.dataBadge", { count: org.dataLayers ?? 0 })}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                      >
                        {(org.droneLayers ?? 0) > 0 ? (
                          <DroneIcon className="size-3" />
                        ) : (
                          <LayersIcon className="size-3" />
                        )}
                        {org.dataLayers}
                        <span className="sr-only">{t("panel.dataBadge", { count: org.dataLayers ?? 0 })}</span>
                      </span>
                    ) : null}
                    {org.lat === null ? null : (
                      <MapPinnedIcon className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" />
                    )}
                  </button>
                </li>
              ))
            )}
        </ul>
      </div>
    </div>
  );
}

// ── Focused org / project card ─────────────────────────────────────────────

function FocusPanel({
  variant,
  mode,
  focusDid,
  focusName,
  orgIdentifier,
  selectedOrg,
  project,
  state,
  siteProjects,
  orgLocationUri,
  selectedSiteUri,
  onSelectSite,
  onClear,
  onRefit,
}: {
  variant: PanelVariant;
  mode: GlobeMode;
  focusDid: string;
  focusName: string | null;
  orgIdentifier: string;
  selectedOrg: GlobeOrganization | null;
  project: GlobeProjectFocus | null;
  state: SiteState;
  /** Certified location AT-URI → titles of the projects that reference it. */
  siteProjects: Map<string, string[]>;
  /** AT-URI of the org's own location record (its "based in" place), if any. */
  orgLocationUri: string | null;
  selectedSiteUri: string | null;
  onSelectSite: (uri: string | null) => void;
  onClear?: () => void;
  onRefit: () => void;
}) {
  const t = useTranslations("marketplace.globe");
  const profileHref = `/account/${encodeURIComponent(orgIdentifier)}`;
  const orgGlobeHref = `/globe/${encodeURIComponent(orgIdentifier)}`;
  const boundaryCount = state.features.length;

  // The org's own location renders under its own heading, apart from the
  // sites its projects work in. Without a declared org location the list
  // stays flat (no headings).
  const orgSites = orgLocationUri
    ? state.sites.filter((site) => site.uri === orgLocationUri)
    : [];
  const projectSites =
    orgSites.length > 0 ? state.sites.filter((site) => site.uri !== orgLocationUri) : state.sites;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex items-start gap-2.5 px-4 pb-3", variant === "sheet" ? "pt-2" : "pt-3.5")}>
        {/* Back to the roster/search — the intuitive way out of a focused org
            (global mode only; dedicated pages use "Back to globe" below). */}
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("focus.clear")}
            title={t("focus.clear")}
            className={cn(
              "grid size-9 shrink-0 place-items-center self-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-primary",
              ELEVATED,
            )}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
        ) : null}
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          {mode === "project" ? <FolderKanbanIcon className="size-4" /> : <Building2Icon className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {mode === "project" ? t("focus.projectLabel") : t("focus.organizationLabel")}
          </p>
          {(mode === "project" ? project?.title : focusName) ? (
            <h2 className="truncate text-sm font-semibold text-foreground">
              {mode === "project" ? project?.title : focusName}
            </h2>
          ) : (
            // Roster still loading (hard refresh of /globe?org=…): skeleton
            // lines where the name + country will appear.
            <>
              <Skeleton className="mt-1 h-4 w-36 rounded-md" />
              <Skeleton className="mt-1.5 h-3 w-24 rounded-md" />
            </>
          )}
          {mode === "project" && focusName ? (
            <Link href={profileHref} className="mt-0.5 block truncate text-xs text-muted-foreground transition-colors hover:text-primary">
              {focusName}
            </Link>
          ) : selectedOrg?.country ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {/* formatCountry already includes the flag. */}
              {formatCountry(selectedOrg.country)}
            </p>
          ) : null}
        </div>
      </div>

      {mode !== "project" ? (
        <div className={cn("px-4 pb-1", variant === "sheet" && "pt-3")}>
          <TrustedByBadges did={focusDid} variant="plain" className="w-fit" />
        </div>
      ) : null}

      <div className={cn("flex flex-wrap items-center gap-2 px-4 pb-3 pt-1", variant === "sheet" && mode === "project" && "pt-3")}>
        {mode === "project" && project ? (
          <Link
            href={project.href}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
          >
            <ArrowLeftIcon className="size-3.5" />
            {t("focus.viewProject")}
          </Link>
        ) : (
          <Link
            href={profileHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
          >
            {t("focus.viewProfile")}
            <ArrowUpRightIcon className="size-3.5" />
          </Link>
        )}
        {mode === "global" ? (
          <Link
            href={orgGlobeHref}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.12] hover:text-primary",
              ELEVATED,
            )}
          >
            <EarthIcon className="size-3.5" />
            {t("focus.openGlobe")}
          </Link>
        ) : null}
        {mode === "project" && focusName ? (
          <Link
            href={orgGlobeHref}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.12] hover:text-primary",
              ELEVATED,
            )}
          >
            <EarthIcon className="size-3.5" />
            {t("focus.orgGlobe")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onRefit}
          aria-label={t("focus.recenter")}
          title={t("focus.recenter")}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-primary",
            ELEVATED,
          )}
        >
          <LocateFixedIcon className="size-3.5" />
        </button>
      </div>

      {mode === "organization" && (
        <Link
          href="/globe"
          className="flex items-center gap-1.5 border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeftIcon className="size-3.5" />
          {t("focus.backToGlobe")}
        </Link>
      )}

      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        {variant === "floating" ? (
          <p className="px-4 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {state.status === "loading"
              ? t("panel.loading")
              : mode === "project"
                ? t("focus.boundaries", { count: boundaryCount })
                : t("focus.sites", { count: state.sites.length })}
          </p>
        ) : null}

        {state.status === "loading" ? (
          <div className="flex flex-col gap-2 px-4 pb-3 pt-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-2/3 rounded-lg" />
          </div>
        ) : mode === "project" ? (
          boundaryCount === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t("focus.noBoundaries")}</p>
          ) : (
            <p className="px-4 py-3 text-xs leading-5 text-muted-foreground">{t("focus.projectHint")}</p>
          )
        ) : state.sites.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t("focus.noSites")}</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            <li>
              <SiteRow
                label={t("focus.allSites")}
                active={selectedSiteUri === null}
                onClick={() => onSelectSite(null)}
              />
            </li>
            {orgSites.length > 0 ? (
              <li>
                <SiteGroupHeading color={ORG_LOCATION_COLOR}>
                  {t("focus.orgLocationHeading")}
                </SiteGroupHeading>
              </li>
            ) : null}
            {orgSites.map((site) => (
              <li key={site.uri}>
                <SiteRow
                  kind="organization"
                  label={site.name}
                  projects={siteProjects.get(site.uri)}
                  active={selectedSiteUri === site.uri}
                  onClick={() => onSelectSite(site.uri)}
                />
              </li>
            ))}
            {orgSites.length > 0 && projectSites.length > 0 ? (
              <li>
                <SiteGroupHeading color={PROJECT_SITE_COLOR}>
                  {t("focus.projectSitesHeading")}
                </SiteGroupHeading>
              </li>
            ) : null}
            {projectSites.map((site) => (
              <li key={site.uri}>
                <SiteRow
                  label={site.name}
                  projects={siteProjects.get(site.uri)}
                  active={selectedSiteUri === site.uri}
                  onClick={() => onSelectSite(site.uri)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Heading splitting the site list into org location vs project sites; the
 *  colored dot echoes the paint color of those features on the map. */
function SiteGroupHeading({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 px-4 pb-0.5 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full ring-1 ring-black/10"
        style={{ backgroundColor: color }}
      />
      {children}
    </p>
  );
}

/** How many project pills a site row shows before collapsing into "+N". */
const SITE_ROW_MAX_PILLS = 2;

function SiteRow({
  label,
  projects,
  active,
  onClick,
  kind = "site",
}: {
  label: string;
  /** Titles of the projects this site belongs to (tag pills). */
  projects?: string[];
  active: boolean;
  onClick: () => void;
  /** "organization" rows carry the org's building icon instead of the pin. */
  kind?: "site" | "organization";
}) {
  const t = useTranslations("marketplace.globe");
  const shown = projects?.slice(0, SITE_ROW_MAX_PILLS) ?? [];
  const hidden = (projects?.length ?? 0) - shown.length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-white/[0.06]",
        active ? "font-medium text-primary" : "text-foreground",
      )}
    >
      {kind === "organization" ? (
        <Building2Icon className={cn("size-3.5 shrink-0 self-start mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
      ) : (
        <MapPinnedIcon className={cn("size-3.5 shrink-0 self-start mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {shown.length > 0 ? (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {shown.map((title) => (
              <span
                key={title}
                title={t("focus.projectPill", { name: title })}
                className="inline-flex max-w-[150px] items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium leading-4 text-primary"
              >
                <FolderKanbanIcon aria-hidden className="size-2.5 shrink-0" />
                <span className="truncate">{title}</span>
                <span className="sr-only">{t("focus.projectPill", { name: title })}</span>
              </span>
            ))}
            {hidden > 0 ? (
              <span
                title={projects!.slice(SITE_ROW_MAX_PILLS).join(", ")}
                className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium leading-4 text-muted-foreground"
              >
                {t("focus.moreProjects", { count: hidden })}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {active ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
    </button>
  );
}

// ── Layers panel ───────────────────────────────────────────────────────────

/** "2025-04-09" → local Date (avoids the UTC-midnight off-by-one). */
function parseDay(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function useDayFormatter(): (date: string) => string {
  const locale = useLocale();
  return useCallback(
    (date: string) =>
      new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(
        parseDay(date),
      ),
    [locale],
  );
}

function LayersPanel({
  landcoverVisible,
  onToggleLandcover,
  categorizedGlobalLayers,
  globalLayersLoading,
  orgLayers,
  orgLayersLoading,
  showOrgLayers,
  enabledLayerIds,
  onToggleLayer,
  onLocateLayer,
  droneSeries,
  activeSeriesId,
  activeSeriesStep,
  onToggleSeries,
  onSelectSeriesStep,
  onLocateSeries,
  treesCount,
  treesLoading,
  treesVisible,
  onToggleTrees,
  visibleLayers,
  legendLayers,
}: {
  landcoverVisible: boolean;
  onToggleLandcover: () => void;
  categorizedGlobalLayers: Array<[string, GlobeLayer[]]>;
  globalLayersLoading: boolean;
  orgLayers: GlobeLayer[];
  orgLayersLoading: boolean;
  showOrgLayers: boolean;
  enabledLayerIds: Set<string>;
  onToggleLayer: (layer: GlobeLayer) => void;
  onLocateLayer: (layer: GlobeLayer) => void;
  droneSeries: DroneTimeSeries[];
  activeSeriesId: string | null;
  activeSeriesStep: number;
  onToggleSeries: (series: DroneTimeSeries) => void;
  onSelectSeriesStep: (series: DroneTimeSeries, step: number) => void;
  onLocateSeries: (series: DroneTimeSeries) => void;
  treesCount: number;
  treesLoading: boolean;
  treesVisible: boolean;
  onToggleTrees: () => void;
  visibleLayers: GlobeLayer[];
  legendLayers: GlobeLayer[];
}) {
  const t = useTranslations("marketplace.globe");
  const hasTreesRow = showOrgLayers && (treesLoading || treesCount > 0);
  const hasVisibleLayerDetails = visibleLayers.length > 0 || landcoverVisible || legendLayers.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <LayersIcon className="size-4 text-primary" />
        {t("layers.title")}
      </h2>

      {/* Land cover (static raster) */}
      <div className="mt-3 overflow-hidden rounded-2xl bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
        <LayerToggleRow
          label={t("layers.landcover")}
          description={t("layers.landcoverSource")}
          checked={landcoverVisible}
          onToggle={onToggleLandcover}
        />
      </div>

      {showOrgLayers ? (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-semibold capitalize text-muted-foreground">
            {t("layers.projectCategory")}
          </h3>
          {hasTreesRow ? (
            <div className="mb-2 overflow-hidden rounded-2xl bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
              {treesLoading ? (
                <div className="p-2">
                  <Skeleton className="h-8 w-full rounded-lg" />
                </div>
              ) : (
                <LayerToggleRow
                  label={t("layers.measuredTrees")}
                  description={t("layers.measuredTreesCount", { count: treesCount })}
                  checked={treesVisible}
                  onToggle={onToggleTrees}
                />
              )}
            </div>
          ) : null}
          {orgLayersLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : orgLayers.length === 0 && droneSeries.length === 0 && !hasTreesRow ? (
            <p className="text-xs text-muted-foreground">{t("layers.noProjectLayers")}</p>
          ) : (
            <>
              {droneSeries.map((series) => (
                <TimeSeriesCard
                  key={series.id}
                  series={series}
                  active={series.id === activeSeriesId}
                  activeStep={activeSeriesStep}
                  onToggle={() => onToggleSeries(series)}
                  onLocate={() => onLocateSeries(series)}
                  onSelectStep={(step) => onSelectSeriesStep(series, step)}
                />
              ))}
              {orgLayers.length > 0 ? (
                <div className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
                  {orgLayers.map((layer) => (
                    <LayerToggleRow
                      key={layer.id}
                      label={layer.name}
                      description={layer.description || undefined}
                      checked={enabledLayerIds.has(layer.id)}
                      onToggle={() => onToggleLayer(layer)}
                      onLocate={layer.bounds ? () => onLocateLayer(layer) : undefined}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {globalLayersLoading ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-2/3 rounded-xl" />
        </div>
      ) : (
        categorizedGlobalLayers.map(([category, layers]) => (
          <div className="mt-4" key={category}>
            <h3 className="mb-1 text-xs font-semibold capitalize text-muted-foreground">{category}</h3>
            <div className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
              {layers.map((layer) => (
                <LayerToggleRow
                  key={layer.id}
                  label={layer.name}
                  description={layer.description || undefined}
                  checked={enabledLayerIds.has(layer.id)}
                  onToggle={() => onToggleLayer(layer)}
                  onLocate={layer.bounds ? () => onLocateLayer(layer) : undefined}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {hasVisibleLayerDetails ? (
        <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold capitalize text-muted-foreground">{t("layers.visibleDetails")}</h3>
          {visibleLayers.length > 0 ? (
            <ActiveLayersCard layers={visibleLayers} onLocate={onLocateLayer} onHide={onToggleLayer} />
          ) : null}
          {landcoverVisible ? <LandcoverLegend /> : null}
          {legendLayers.map((layer) => (
            <LayerLegendCard key={layer.id} layer={layer} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LayerToggleRow({
  label,
  description,
  checked,
  onToggle,
  onLocate,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  /** "Zoom to layer" — shown when the layer declares a map footprint. */
  onLocate?: () => void;
}) {
  const t = useTranslations("marketplace.globe");
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {onLocate ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onLocate();
          }}
          aria-label={t("layers.flyTo", { name: label })}
          title={t("layers.flyTo", { name: label })}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-primary"
        >
          <LocateFixedIcon className="size-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]",
          checked ? "bg-primary/90" : "bg-white/20 hover:bg-white/30",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full shadow transition-[left,background-color]",
            checked ? "left-[calc(100%-1.25rem)] bg-white" : "left-1 bg-white",
          )}
        />
      </button>
    </label>
  );
}

// ── Drone time series (repeat flights over the same area) ─────────────────

/** Layers-panel card for one detected series: one switch for the whole
 *  timeline plus a chip per capture date, replacing the pile of
 *  indistinguishable per-flight toggles. */
function TimeSeriesCard({
  series,
  active,
  activeStep,
  onToggle,
  onLocate,
  onSelectStep,
}: {
  series: DroneTimeSeries;
  active: boolean;
  /** Current slider stop — only meaningful while `active`. */
  activeStep: number;
  onToggle: () => void;
  onLocate: () => void;
  onSelectStep: (step: number) => void;
}) {
  const t = useTranslations("marketplace.globe");
  const formatDay = useDayFormatter();

  return (
    <div
      data-testid="globe-time-series-card"
      className={cn(
        "mb-2 overflow-hidden rounded-2xl bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-colors",
        active && "bg-white/[0.12]",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <HistoryIcon className="size-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">{series.name}</span>
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {t("timeline.seriesFlights", { count: series.layers.length })}
          </span>
        </span>
        <button
          type="button"
          onClick={onLocate}
          aria-label={t("layers.flyTo", { name: series.name })}
          title={t("layers.flyTo", { name: series.name })}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-primary"
        >
          <LocateFixedIcon className="size-3.5" />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={t("timeline.toggle", { name: series.name })}
          onClick={onToggle}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]",
            active ? "bg-primary/90" : "bg-white/20 hover:bg-white/30",
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 size-4 -translate-y-1/2 rounded-full shadow transition-[left,background-color]",
              active ? "left-[calc(100%-1.25rem)] bg-white" : "left-1 bg-white",
            )}
          />
        </button>
      </div>
      <p className="px-3.5 pt-1 text-[11px] leading-4 text-muted-foreground">
        {t("timeline.seriesHint")}
      </p>
      <div className="flex flex-wrap gap-1 px-3.5 py-2.5">
        {series.steps.map((step, index) => (
          <button
            key={step.date}
            type="button"
            onClick={() => onSelectStep(index)}
            aria-pressed={active && index === activeStep}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
              active && index === activeStep
                ? "bg-primary/10 text-primary"
                : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.12] hover:text-primary",
            )}
          >
            {formatDay(step.date)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Floating time slider (bottom center) while a drone series is active —
 *  scrub, step, or auto-play through the captures of the same area. */
function TimeSliderCard({
  series,
  step,
  playing,
  onStepChange,
  onTogglePlay,
  onLocate,
  onClose,
}: {
  series: DroneTimeSeries;
  step: number;
  playing: boolean;
  onStepChange: (step: number) => void;
  onTogglePlay: () => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("marketplace.globe");
  const formatDay = useDayFormatter();
  const lastStep = series.steps.length - 1;
  const current = series.steps[Math.min(step, lastStep)]!;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[6.75rem] z-20 flex justify-center md:bottom-8">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 14 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        aria-label={t("timeline.title")}
        data-testid="globe-time-slider"
        className={cn("pointer-events-auto w-full max-w-[460px] rounded-2xl p-3.5 shadow-xl", OUTLINE_SURFACE)}
      >
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <HistoryIcon className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold text-foreground">{series.name}</span>
          </span>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {formatDay(current.date)}
          </span>
          <button
            type="button"
            onClick={onLocate}
            aria-label={t("layers.flyTo", { name: series.name })}
            title={t("layers.flyTo", { name: series.name })}
            className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <LocateFixedIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("timeline.close")}
            title={t("timeline.close")}
            className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? t("timeline.pause") : t("timeline.play")}
            title={playing ? t("timeline.pause") : t("timeline.play")}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-dark"
          >
            {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onStepChange(Math.max(0, step - 1))}
            disabled={step <= 0}
            aria-label={t("timeline.previous")}
            title={t("timeline.previous")}
            className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <input
            type="range"
            min={0}
            max={lastStep}
            step={1}
            value={Math.min(step, lastStep)}
            onChange={(event) => onStepChange(Number(event.target.value))}
            aria-label={t("timeline.slider")}
            aria-valuetext={formatDay(current.date)}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <button
            type="button"
            onClick={() => onStepChange(Math.min(lastStep, step + 1))}
            disabled={step >= lastStep}
            aria-label={t("timeline.next")}
            title={t("timeline.next")}
            className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between pl-[4.75rem] pr-9 text-[10px] text-muted-foreground">
          <span>{formatDay(series.steps[0]!.date)}</span>
          <span>{t("timeline.step", { current: Math.min(step, lastStep) + 1, total: series.steps.length })}</span>
          <span>{formatDay(series.steps[lastStep]!.date)}</span>
        </div>
      </motion.section>
    </div>
  );
}

// ── Selected tree detail sidebar ────────────────────────────────────────

function TreeDetailPanel({ tree, onClose }: { tree: TreeDetail; onClose: () => void }) {
  const t = useTranslations("marketplace.globe");
  const [activePhoto, setActivePhoto] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const photos = tree.photos.filter((_, index) => !failed.has(index));
  const heroSrc = tree.photos[activePhoto] && !failed.has(activePhoto) ? tree.photos[activePhoto] : null;
  const species = tree.species ?? t("tree.unknownSpecies");

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 12, filter: "blur(6px)" }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      aria-label={t("tree.title")}
      data-testid="globe-tree-detail"
      className={cn(
        "pointer-events-auto absolute right-3 top-4 z-30 flex max-h-[calc(100%-2rem)] w-[300px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl shadow-xl md:right-4",
        OUTLINE_SURFACE,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <LeafIcon className="size-3.5 text-primary" />
          {t("tree.title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("tree.close")}
          className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative aspect-square w-full bg-muted">
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroSrc}
              alt={species}
              loading="lazy"
              onError={() => setFailed((prev) => new Set(prev).add(activePhoto))}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <LeafIcon className="size-10 opacity-40" />
            </div>
          )}
        </div>

        {photos.length > 1 ? (
          <div className="flex gap-1.5 px-3 pt-3">
            {tree.photos.map((photo, index) =>
              failed.has(index) ? null : (
                <button
                  key={photo}
                  type="button"
                  onClick={() => setActivePhoto(index)}
                  aria-label={t("tree.photo", { index: index + 1 })}
                  className={cn(
                    "size-11 shrink-0 overflow-hidden rounded-lg border transition-colors",
                    index === activePhoto ? "border-primary" : "border-border hover:border-primary/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt=""
                    loading="lazy"
                    onError={() => setFailed((prev) => new Set(prev).add(index))}
                    className="h-full w-full object-cover"
                  />
                </button>
              ),
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("tree.species")}
            </p>
            <h2 className={cn("text-lg font-bold leading-tight text-foreground", tree.species && "italic")}>
              {species}
            </h2>
          </div>

          <div className="flex items-stretch gap-2">
            <div className="flex flex-1 flex-col gap-0.5 rounded-xl bg-muted p-2.5">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MoveVerticalIcon className="size-3" />
                {t("tree.height")}
              </span>
              <span className="text-base font-bold text-foreground">{tree.height ?? t("tree.unknown")}</span>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 rounded-xl bg-muted p-2.5">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MoveHorizontalIcon className="size-3" />
                {t("tree.dbh")}
              </span>
              <span className="text-base font-bold text-foreground">{tree.dbh ?? t("tree.unknown")}</span>
            </div>
          </div>

          {tree.date ? (
            <p className="text-xs text-muted-foreground">
              {t("tree.measured")} <span className="text-foreground">{tree.date}</span>
            </p>
          ) : null}
          {tree.notes ? (
            <p className="text-xs leading-5 text-muted-foreground">{tree.notes}</p>
          ) : null}
        </div>
      </div>
    </motion.aside>
  );
}

// ── Visible layers summary ──────────────────────────────────────────────────

/** Lists exactly which data layers are on the map right now, with "zoom to
 *  layer" and quick-hide actions — so toggling many drone images never leaves
 *  the user guessing which one is visible. */
function ActiveLayersCard({
  layers,
  onLocate,
  onHide,
}: {
  layers: GlobeLayer[];
  onLocate: (layer: GlobeLayer) => void;
  onHide: (layer: GlobeLayer) => void;
}) {
  const t = useTranslations("marketplace.globe");
  return (
    <div data-testid="globe-active-layers" className="pointer-events-auto rounded-xl bg-white/[0.06] p-3 shadow-lg">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <LayersIcon className="size-3.5 text-primary" />
        {t("layers.visibleNow", { count: layers.length })}
      </p>
      <ul className="mt-2 flex max-h-36 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {layers.map((layer) => (
          <li key={layer.id} className="flex items-center gap-1">
            {layer.bounds ? (
              <button
                type="button"
                onClick={() => onLocate(layer)}
                title={t("layers.flyTo", { name: layer.name })}
                className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded text-left text-[11px] text-muted-foreground transition-colors hover:text-primary"
              >
                <LocateFixedIcon className="size-3 shrink-0" />
                <span className="truncate">{layer.name}</span>
              </button>
            ) : (
              <span className="flex h-6 min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden className="size-3 shrink-0" />
                <span className="truncate">{layer.name}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => onHide(layer)}
              aria-label={t("layers.hide", { name: layer.name })}
              title={t("layers.hide", { name: layer.name })}
              className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LandcoverLegend() {
  const t = useTranslations("marketplace.globe");
  return (
    <div className="pointer-events-auto rounded-xl bg-white/[0.06] p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{t("layers.landcover")}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {LANDCOVER_LEGEND.map((entry) => (
          <span key={entry.labelKey} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            {t(`layers.landcoverClasses.${entry.labelKey}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function LayerLegendCard({ layer }: { layer: GlobeLayer }) {
  return (
    <div className="pointer-events-auto rounded-xl bg-white/[0.06] p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{layer.name}</p>
      <div className="mt-2 flex flex-col gap-1">
        {layer.legend?.map((entry) => (
          <span key={`${layer.id}-${entry.label}`} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
