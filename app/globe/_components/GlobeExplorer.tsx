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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  Building2Icon,
  ChevronDownIcon,
  EarthIcon,
  FolderKanbanIcon,
  LayersIcon,
  LeafIcon,
  LocateFixedIcon,
  MapPinnedIcon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { countryFlag, formatCountry } from "../../_lib/format";
import { resolveCertifiedLocationCoords } from "../../_lib/coords";
import { TrustedByBadges } from "../../_components/TrustedByBadges";
import { GlobeMap } from "./GlobeMap";
import { LANDCOVER_LEGEND } from "../_lib/config";
import {
  fetchGlobeOrganizations,
  fetchOrganizationSites,
  fetchSiteGeoJson,
  geojsonBounds,
  mergeBounds,
  pointBounds,
  toFeatures,
} from "../_lib/data";
import { fetchGlobalLayers, fetchOrganizationLayers } from "../_lib/layers";
import { fetchOrganizationTrees, type TreeDetail } from "../_lib/trees";
import type {
  GlobeLayer,
  GlobeOrganization,
  GlobeSite,
  LngLatBounds,
} from "../_lib/globe-types";

const WORLD_BOUNDS: LngLatBounds = [-150, -50, 150, 65];

export type GlobeProjectFocus = {
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
  }, [focusDid]);

  // ── Data layers ──────────────────────────────────────────────────────────
  const [globalLayers, setGlobalLayers] = useState<GlobeLayer[] | null>(null);
  const [orgLayers, setOrgLayers] = useState<GlobeLayer[]>([]);
  const [orgLayersLoading, setOrgLayersLoading] = useState(false);
  const [enabledLayerIds, setEnabledLayerIds] = useState<Set<string>>(new Set());
  const [landcoverVisible, setLandcoverVisible] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

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
    if (!focusDid) return;
    const controller = new AbortController();
    setOrgLayersLoading(true);
    fetchOrganizationLayers(focusDid, controller.signal)
      .then((layers) => {
        setOrgLayers(layers);
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

  const toggleLayer = useCallback((layerId: string) => {
    setEnabledLayerIds((current) => {
      const next = new Set(current);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const categorizedGlobalLayers = useMemo(() => {
    const categories = new Map<string, GlobeLayer[]>();
    for (const layer of globalLayers ?? []) {
      const list = categories.get(layer.category) ?? [];
      list.push(layer);
      categories.set(layer.category, list);
    }
    return [...categories.entries()];
  }, [globalLayers]);

  const activeLayers = useMemo(
    () => [...(globalLayers ?? []), ...orgLayers].filter((layer) => enabledLayerIds.has(layer.id)),
    [globalLayers, orgLayers, enabledLayerIds],
  );
  const activeLegends = useMemo(
    () => activeLayers.filter((layer) => (layer.legend?.length ?? 0) > 0),
    [activeLayers],
  );

  // ── Derived map inputs ───────────────────────────────────────────────────
  const focusedState = mode === "project" ? projectState : siteState;
  const visibleOrganizations = useMemo(() => {
    if (!organizations) return [];
    if (mode !== "global" || !maEarthOnly) return organizations;
    return organizations.filter((org) => org.maEarth === true);
  }, [organizations, mode, maEarthOnly]);

  const highlightFeatures = useMemo(() => {
    if (!selectedSiteUri) return [];
    return focusedState.features.filter((feature) => feature.properties?.siteUri === selectedSiteUri);
  }, [focusedState.features, selectedSiteUri]);

  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
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
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const collapseSheet = useCallback(() => setSheetExpanded(false), []);

  // Collapse the sheet whenever the focus changes so the flight is visible.
  useEffect(() => {
    setSheetExpanded(false);
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

  // Shared panel props.
  const globalPanelProps = {
    organizations,
    visibleOrganizations,
    maEarthOnly,
    onToggleMaEarth: () => setMaEarthOnly((value) => !value),
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

  // Bottom-sheet header summary (mobile).
  const sheetTitle = focusDid ? (mode === "project" ? project?.title ?? "…" : focusName ?? "…") : t("title");
  const sheetSubtitle = focusDid
    ? focusedState.status === "loading"
      ? t("panel.loading")
      : mode === "project"
        ? t("focus.boundaries", { count: focusedState.features.length })
        : t("focus.sites", { count: focusedState.sites.length })
    : organizations === null
      ? t("panel.loading")
      : t("panel.count", { count: visibleOrganizations.length });
  const SheetIcon = focusDid ? (mode === "project" ? FolderKanbanIcon : Building2Icon) : EarthIcon;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0b19]" data-testid="globe-explorer">
      <GlobeMap
        className="absolute inset-0"
        organizations={visibleOrganizations}
        onSelectOrganization={(did) => selectOrganization(did)}
        sitesGeojson={featureCollection(focusedState.features)}
        highlightGeojson={featureCollection(highlightFeatures)}
        treesGeojson={treesVisible ? treesState.data : null}
        onSelectTree={setSelectedTree}
        selectedTreeId={selectedTree?.id ?? null}
        bounds={mapBounds}
        boundsKey={`${focusDid ?? "none"}:${selectedSiteUri ?? "all"}:${boundsNonce}`}
        boundsPadding={
          isDesktop
            ? { top: 96, bottom: 64, left: 416, right: 64 }
            : { top: 84, bottom: 150, left: 36, right: 36 }
        }
        spin={mode === "global" && !focusDid}
        landcoverVisible={landcoverVisible}
        activeLayers={activeLayers}
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

      {/* ── Layers control (top-right, both breakpoints) ── */}
      <div className="pointer-events-none absolute right-3 top-[4.25rem] z-20 flex max-h-[calc(100%-11rem)] flex-col items-end gap-2.5 md:right-4 md:max-h-[calc(100%-6rem)]">
        <button
          type="button"
          onClick={() => setLayersOpen((value) => !value)}
          aria-expanded={layersOpen}
          aria-label={t("layers.button")}
          className={cn(
            "pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/85 px-3.5 text-sm font-medium text-foreground shadow-lg backdrop-blur-xl transition-all hover:border-primary/40 hover:text-primary active:scale-[0.97] sm:px-4",
            layersOpen && "border-primary/40 text-primary",
          )}
        >
          <LayersIcon className="size-4" />
          <span className="hidden sm:inline">{t("layers.button")}</span>
        </button>

        <AnimatePresence>
          {layersOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="pointer-events-auto flex min-h-0 w-[320px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl"
            >
              <LayersPanel
                landcoverVisible={landcoverVisible}
                onToggleLandcover={() => setLandcoverVisible((value) => !value)}
                categorizedGlobalLayers={categorizedGlobalLayers}
                globalLayersLoading={globalLayers === null}
                orgLayers={orgLayers}
                orgLayersLoading={orgLayersLoading}
                showOrgLayers={Boolean(focusDid)}
                enabledLayerIds={enabledLayerIds}
                onToggleLayer={toggleLayer}
                treesCount={treesState.data?.features.length ?? 0}
                treesLoading={treesState.status === "loading"}
                treesVisible={treesVisible}
                onToggleTrees={() => setTreesVisible((value) => !value)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ── Desktop: floating left panel ── */}
      <div
        data-testid="globe-desktop-panel"
        className="pointer-events-none absolute left-4 top-[4.25rem] z-10 hidden max-h-[calc(100%-6rem)] w-[360px] flex-col gap-3 md:flex"
      >
        {!focusDid && mode === "global" ? (
          <motion.section
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl"
          >
            <GlobalPanel variant="floating" {...globalPanelProps} />
          </motion.section>
        ) : null}

        {focusPanelProps ? (
          <motion.section
            key={focusDid}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl"
          >
            <FocusPanel variant="floating" {...focusPanelProps} />
          </motion.section>
        ) : null}
      </div>

      {/* ── Mobile: bottom sheet ── */}
      <div className="md:hidden">
        <section
          aria-label={sheetTitle}
          data-testid="globe-sheet"
          className={cn(
            "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[min(62dvh,520px)] flex-col rounded-t-2xl border-x border-t border-border bg-background/95 shadow-[0_-8px_32px_rgb(0_0_0/0.25)] backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
          )}
          style={{
            transform: sheetExpanded ? "translateY(0)" : "translateY(calc(100% - 4.75rem))",
          }}
        >
          <button
            type="button"
            onClick={() => setSheetExpanded((value) => !value)}
            aria-expanded={sheetExpanded}
            aria-label={sheetExpanded ? t("sheet.collapse") : t("sheet.expand")}
            className="flex w-full flex-col items-center gap-0 pt-2"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border" />
            <span className="flex w-full items-center gap-3 px-4 pb-2.5 pt-2 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <SheetIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{sheetTitle}</span>
                <span className="block truncate text-xs text-muted-foreground">{sheetSubtitle}</span>
              </span>
              <ChevronDownIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                  sheetExpanded ? "rotate-0" : "rotate-180",
                )}
              />
            </span>
          </button>

          <div className="flex min-h-0 flex-1 flex-col border-t border-border pb-[env(safe-area-inset-bottom)]">
            {focusPanelProps ? (
              <FocusPanel variant="sheet" {...focusPanelProps} />
            ) : (
              <GlobalPanel variant="sheet" {...globalPanelProps} />
            )}
          </div>
        </section>
      </div>

      {/* ── Active layer legends ── */}
      {activeLegends.length > 0 || landcoverVisible ? (
        <div className="pointer-events-none absolute bottom-24 left-3 z-10 flex max-w-[min(320px,calc(100vw-6rem))] flex-col gap-2 md:bottom-8 md:left-4 md:max-w-[min(360px,calc(100vw-1.5rem))]">
          {landcoverVisible ? <LandcoverLegend /> : null}
          {activeLegends.map((layer) => (
            <div
              key={layer.id}
              className="pointer-events-auto rounded-xl border border-border bg-background/85 p-3 shadow-lg backdrop-blur-xl"
            >
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
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Global mode: search + roster ───────────────────────────────────────────

function GlobalPanel({
  variant,
  organizations,
  visibleOrganizations,
  maEarthOnly,
  onToggleMaEarth,
  onSelect,
}: {
  variant: PanelVariant;
  organizations: GlobeOrganization[] | null;
  visibleOrganizations: GlobeOrganization[];
  maEarthOnly: boolean;
  onToggleMaEarth: () => void;
  onSelect: (did: string) => void;
}) {
  const t = useTranslations("marketplace.globe");
  const [query, setQuery] = useState("");
  // The floating (desktop) panel shows the roster right away for
  // discoverability; the sheet always shows it when expanded.
  const [listOpen, setListOpen] = useState(true);
  const showList = variant === "sheet" || listOpen;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleOrganizations;
    return visibleOrganizations.filter((org) => org.name.toLowerCase().includes(q));
  }, [visibleOrganizations, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === "floating" ? (
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <EarthIcon className="size-4 text-primary" />
              {t("title")}
            </h1>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setListOpen((value) => !value)}
            aria-expanded={listOpen}
            aria-label={t("panel.toggleList")}
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ChevronDownIcon className={cn("size-4 transition-transform", listOpen && "rotate-180")} />
          </button>
        </div>
      ) : null}

      <div className={cn("flex items-center gap-2 px-4", variant === "floating" ? "pb-3" : "py-3")}>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setListOpen(true);
            }}
            placeholder={t("panel.searchPlaceholder")}
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>
        <button
          type="button"
          onClick={onToggleMaEarth}
          aria-pressed={maEarthOnly}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
            maEarthOnly
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
        >
          <Image
            src="/assets/media/images/badges/ma-earth-logo.webp"
            alt=""
            width={16}
            height={16}
            className="size-4 rounded-full"
          />
          {t("panel.maEarth")}
        </button>
      </div>

      {showList ? (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
          {variant === "floating" ? (
            <p className="px-4 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {organizations === null
                ? t("panel.loading")
                : t("panel.count", { count: filtered.length })}
            </p>
          ) : null}
          <ul
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
            style={variant === "floating" ? { maxHeight: "42vh" } : undefined}
          >
            {organizations === null ? (
              <li className="flex flex-col gap-2 px-4 py-2">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-9 w-3/4 rounded-lg" />
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t("panel.empty")}</li>
            ) : (
              filtered.map((org) => (
                <li key={org.did}>
                  <button
                    type="button"
                    onClick={() => onSelect(org.did)}
                    className="group flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/60"
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
                          {formatCountry(org.country)}
                        </span>
                      ) : null}
                    </span>
                    {org.lat === null ? null : (
                      <MapPinnedIcon className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
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
  selectedSiteUri: string | null;
  onSelectSite: (uri: string | null) => void;
  onClear?: () => void;
  onRefit: () => void;
}) {
  const t = useTranslations("marketplace.globe");
  const profileHref = `/account/${encodeURIComponent(orgIdentifier)}`;
  const orgGlobeHref = `/globe/${encodeURIComponent(orgIdentifier)}`;
  const boundaryCount = state.features.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === "floating" ? (
        <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            {mode === "project" ? <FolderKanbanIcon className="size-4" /> : <Building2Icon className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {mode === "project" ? t("focus.projectLabel") : t("focus.organizationLabel")}
            </p>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {mode === "project" ? project?.title : focusName ?? "…"}
            </h2>
            {mode === "project" && focusName ? (
              <Link href={profileHref} className="mt-0.5 block truncate text-xs text-muted-foreground transition-colors hover:text-primary">
                {focusName}
              </Link>
            ) : selectedOrg?.country ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {countryFlag(selectedOrg.country)} {formatCountry(selectedOrg.country)}
              </p>
            ) : null}
          </div>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              aria-label={t("focus.clear")}
              className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

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
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <EarthIcon className="size-3.5" />
            {t("focus.openGlobe")}
          </Link>
        ) : null}
        {mode === "project" && focusName ? (
          <Link
            href={orgGlobeHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
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
          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <LocateFixedIcon className="size-3.5" />
        </button>
        {variant === "sheet" && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <XIcon className="size-3.5" />
            {t("focus.clear")}
          </button>
        ) : null}
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
          <ul
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
            style={variant === "floating" ? { maxHeight: "32vh" } : undefined}
          >
            <li>
              <SiteRow
                label={t("focus.allSites")}
                active={selectedSiteUri === null}
                onClick={() => onSelectSite(null)}
              />
            </li>
            {state.sites.map((site) => (
              <li key={site.uri}>
                <SiteRow
                  label={site.name}
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

function SiteRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-muted/60",
        active ? "font-medium text-primary" : "text-foreground",
      )}
    >
      <MapPinnedIcon className={cn("size-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
    </button>
  );
}

// ── Layers panel ───────────────────────────────────────────────────────────

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
  treesCount,
  treesLoading,
  treesVisible,
  onToggleTrees,
}: {
  landcoverVisible: boolean;
  onToggleLandcover: () => void;
  categorizedGlobalLayers: Array<[string, GlobeLayer[]]>;
  globalLayersLoading: boolean;
  orgLayers: GlobeLayer[];
  orgLayersLoading: boolean;
  showOrgLayers: boolean;
  enabledLayerIds: Set<string>;
  onToggleLayer: (layerId: string) => void;
  treesCount: number;
  treesLoading: boolean;
  treesVisible: boolean;
  onToggleTrees: () => void;
}) {
  const t = useTranslations("marketplace.globe");
  const hasTreesRow = showOrgLayers && (treesLoading || treesCount > 0);

  return (
    <div className="flex max-h-[min(56vh,520px)] flex-col overflow-y-auto overscroll-contain p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <LayersIcon className="size-4 text-primary" />
        {t("layers.title")}
      </h2>

      {/* Land cover (static raster) */}
      <div className="mt-3 rounded-xl border border-border bg-background/60">
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
            <div className="mb-2 rounded-xl border border-border bg-background/60">
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
          ) : orgLayers.length === 0 && !hasTreesRow ? (
            <p className="text-xs text-muted-foreground">{t("layers.noProjectLayers")}</p>
          ) : orgLayers.length === 0 ? null : (
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background/60">
              {orgLayers.map((layer) => (
                <LayerToggleRow
                  key={layer.id}
                  label={layer.name}
                  description={layer.description || undefined}
                  checked={enabledLayerIds.has(layer.id)}
                  onToggle={() => onToggleLayer(layer.id)}
                />
              ))}
            </div>
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
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background/60">
              {layers.map((layer) => (
                <LayerToggleRow
                  key={layer.id}
                  label={layer.name}
                  description={layer.description || undefined}
                  checked={enabledLayerIds.has(layer.id)}
                  onToggle={() => onToggleLayer(layer.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LayerToggleRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">{label}</span>
        {description ? (
          <span className="block truncate text-[11px] text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-background shadow transition-[left]",
            checked ? "left-[calc(100%-1.05rem)]" : "left-0.5",
          )}
        />
      </button>
    </label>
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
      className="pointer-events-auto absolute right-3 top-[7.5rem] z-30 flex max-h-[calc(100%-9rem)] w-[300px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl md:right-4"
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

function LandcoverLegend() {
  const t = useTranslations("marketplace.globe");
  return (
    <div className="pointer-events-auto rounded-xl border border-border bg-background/85 p-3 shadow-lg backdrop-blur-xl">
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
