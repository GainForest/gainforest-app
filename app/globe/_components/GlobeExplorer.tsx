"use client";

/**
 * GlobeExplorer — the full-page Green Globe experience, rebuilt natively on the
 * app's design system. Three modes share one component:
 *
 *   - global   (/globe):                    every organization on the planet,
 *                                           idle-spinning globe, search + data layers
 *   - organization (/globe/[identifier]):   zoomed to one org's project sites
 *   - project  (/globe/[identifier]/[rkey]): zoomed to a project's site boundaries
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Loader2Icon,
  LocateFixedIcon,
  MapPinnedIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { countryFlag } from "../../_lib/format";
import { fetchTrustedOrganizationBadges } from "../../_lib/indexer";
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
  const mode: "global" | "organization" | "project" = project ? "project" : orgDid ? "organization" : "global";

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

  // Ma Earth roster filter (global mode). The badge index is cached, so
  // per-DID lookups after the first resolve are effectively free.
  const [maEarthOnly, setMaEarthOnly] = useState(false);
  const [maEarthDids, setMaEarthDids] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!maEarthOnly || maEarthDids || !organizations) return;
    let cancelled = false;
    (async () => {
      const dids = new Set<string>();
      for (const org of organizations) {
        try {
          const badges = await fetchTrustedOrganizationBadges(org.did);
          if (badges.includes("maearth")) dids.add(org.did);
        } catch {
          /* skip org on badge failure */
        }
      }
      if (!cancelled) setMaEarthDids(dids);
    })();
    return () => {
      cancelled = true;
    };
  }, [maEarthOnly, maEarthDids, organizations]);

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
    if (mode !== "global") return organizations;
    if (maEarthOnly && maEarthDids) {
      return organizations.filter((org) => maEarthDids.has(org.did));
    }
    return organizations;
  }, [organizations, mode, maEarthOnly, maEarthDids]);

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

  // Extra camera padding so fitted sites are not hidden under the side panel.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="globe-explorer">
      <GlobeMap
        className="absolute inset-0"
        organizations={visibleOrganizations}
        onSelectOrganization={(did) => selectOrganization(did)}
        sitesGeojson={featureCollection(focusedState.features)}
        highlightGeojson={featureCollection(highlightFeatures)}
        bounds={mapBounds}
        boundsKey={`${focusDid ?? "none"}:${selectedSiteUri ?? "all"}:${boundsNonce}`}
        boundsPadding={{ top: 96, bottom: 64, left: isDesktop ? 416 : 40, right: isDesktop ? 64 : 40 }}
        spin={mode === "global" && !focusDid}
        landcoverVisible={landcoverVisible}
        activeLayers={activeLayers}
      />

      {/* ── Left panel ── */}
      <div className="pointer-events-none absolute inset-x-3 top-[4.25rem] z-10 flex max-h-[calc(100%-6rem)] flex-col gap-3 md:inset-x-auto md:left-4 md:w-[360px]">
        {mode === "global" && !focusDid ? (
          <GlobalPanel
            organizations={organizations}
            visibleOrganizations={visibleOrganizations}
            maEarthOnly={maEarthOnly}
            maEarthReady={!maEarthOnly || maEarthDids !== null}
            onToggleMaEarth={() => setMaEarthOnly((value) => !value)}
            onSelect={(did) => selectOrganization(did)}
          />
        ) : null}

        {focusDid ? (
          <FocusPanel
            mode={mode}
            focusDid={focusDid}
            focusName={focusName}
            orgIdentifier={mode === "global" ? focusDid : orgIdentifier ?? focusDid}
            selectedOrg={selectedOrg}
            project={project}
            state={focusedState}
            selectedSiteUri={selectedSiteUri}
            onSelectSite={selectSite}
            onClear={mode === "global" ? () => selectOrganization(null) : undefined}
            onRefit={bumpBounds}
          />
        ) : null}
      </div>

      {/* ── Right controls: data layers ── */}
      <div className="pointer-events-none absolute right-3 top-[4.25rem] z-10 flex max-h-[calc(100%-6rem)] flex-col items-end gap-3 md:right-4">
        <button
          type="button"
          onClick={() => setLayersOpen((value) => !value)}
          aria-expanded={layersOpen}
          className={cn(
            "pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/85 px-4 text-sm font-medium text-foreground shadow-lg backdrop-blur-xl transition-colors hover:border-primary/40 hover:text-primary",
            layersOpen && "border-primary/40 text-primary",
          )}
        >
          <LayersIcon className="size-4" />
          {t("layers.button")}
        </button>

        <AnimatePresence>
          {layersOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="pointer-events-auto flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl"
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
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ── Active layer legends ── */}
      {activeLegends.length > 0 || landcoverVisible ? (
        <div className="pointer-events-none absolute bottom-8 left-3 z-10 flex max-w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 md:left-4">
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
  organizations,
  visibleOrganizations,
  maEarthOnly,
  maEarthReady,
  onToggleMaEarth,
  onSelect,
}: {
  organizations: GlobeOrganization[] | null;
  visibleOrganizations: GlobeOrganization[];
  maEarthOnly: boolean;
  maEarthReady: boolean;
  onToggleMaEarth: () => void;
  onSelect: (did: string) => void;
}) {
  const t = useTranslations("marketplace.globe");
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleOrganizations;
    return visibleOrganizations.filter((org) => org.name.toLowerCase().includes(q));
  }, [visibleOrganizations, query]);

  return (
    <section className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl">
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

      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            placeholder={t("panel.searchPlaceholder")}
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>
        <button
          type="button"
          onClick={onToggleMaEarth}
          aria-pressed={maEarthOnly}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
            maEarthOnly
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
        >
          {maEarthOnly && !maEarthReady ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {t("panel.maEarth")}
        </button>
      </div>

      {listOpen ? (
        <div className="flex min-h-0 flex-col border-t border-border">
          <p className="px-4 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {organizations === null
              ? t("panel.loading")
              : t("panel.count", { count: filtered.length })}
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto pb-2" style={{ maxHeight: "40vh" }}>
            {organizations === null ? (
              <li className="flex flex-col gap-2 px-4 py-2">
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-3/4 rounded-lg" />
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t("panel.empty")}</li>
            ) : (
              filtered.map((org) => (
                <li key={org.did}>
                  <button
                    type="button"
                    onClick={() => onSelect(org.did)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm">
                      {(org.country ? countryFlag(org.country) : "") || "🌍"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{org.name}</span>
                    {org.lat === null ? null : (
                      <MapPinnedIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ── Focused org / project card ─────────────────────────────────────────────

function FocusPanel({
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
  mode: "global" | "organization" | "project";
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
    <section className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-xl backdrop-blur-xl">
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
              {countryFlag(selectedOrg.country)} {selectedOrg.country}
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

      {mode !== "project" ? (
        <div className="px-4 pb-1">
          <TrustedByBadges did={focusDid} variant="plain" className="w-fit" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
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

      <div className="flex min-h-0 flex-col border-t border-border">
        <p className="px-4 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {state.status === "loading"
            ? t("panel.loading")
            : mode === "project"
              ? t("focus.boundaries", { count: boundaryCount })
              : t("focus.sites", { count: state.sites.length })}
        </p>

        {state.status === "loading" ? (
          <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-2/3 rounded-lg" />
          </div>
        ) : mode === "project" ? (
          boundaryCount === 0 ? (
            <p className="px-4 pb-3 text-sm text-muted-foreground">{t("focus.noBoundaries")}</p>
          ) : (
            <p className="px-4 pb-3 text-xs leading-5 text-muted-foreground">{t("focus.projectHint")}</p>
          )
        ) : state.sites.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-muted-foreground">{t("focus.noSites")}</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto pb-2" style={{ maxHeight: "32vh" }}>
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
    </section>
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
}) {
  const t = useTranslations("marketplace.globe");

  return (
    <div className="flex max-h-[min(60vh,520px)] flex-col overflow-y-auto p-4">
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
          {orgLayersLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : orgLayers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("layers.noProjectLayers")}</p>
          ) : (
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
