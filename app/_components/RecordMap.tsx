"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, MarkerClusterGroup, MarkerCluster, TileLayer } from "leaflet";
import { mapTileUrl, resolvePointsFor, type MapPoint } from "../_lib/coords";
import type { ExplorerRecord, RecordKind } from "../_lib/indexer";
import { formatNumber, formatCompact } from "../_lib/format";
import { accountHref, preferredDidIdentifier } from "../_lib/urls";
import { getCachedProfile } from "../_lib/did-profile";

// Map view for the record streams. Vanilla Leaflet (dynamically imported so it
// never touches `window` during SSR) + leaflet.markercluster on CARTO Positron
// tiles to match the cream palette. Records cluster into labelled sage bubbles
// so a dense survey site reads as one "412" pin instead of a confusing pile of
// overlapping dots; click a cluster to zoom in, and fully-coincident points
// spiderfy at max zoom. Clicking a single pin opens the loaded record's drawer,
// or links out to the org when the pin is not part of the loaded page.

function clusterTier(n: number): { tier: string; size: number } {
  if (n < 10) return { tier: "sm", size: 36 };
  if (n < 100) return { tier: "md", size: 44 };
  if (n < 1000) return { tier: "lg", size: 52 };
  return { tier: "xl", size: 60 };
}

export function RecordMap({
  records,
  kind,
  onOpen,
}: {
  records: ExplorerRecord[];
  kind: RecordKind;
  onOpen: (r: ExplorerRecord) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<MarkerClusterGroup | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [resolving, setResolving] = useState(true);
  // Auto-fit bookkeeping: `userMoved` disables auto-fit once the visitor pans
  // or zooms; `fitting` marks our own programmatic moves so they don't count
  // as user interaction. Both reset when a new data set loads.
  const userMovedRef = useRef(false);
  const fittingRef = useRef(false);

  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  // Init the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      // Patches the imported L instance with markerClusterGroup().
      await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const dark = document.documentElement.classList.contains("dark");
      const map = L.map(elRef.current, {
        worldCopyJump: true,
        minZoom: 1,
        zoomControl: false,
      }).setView([12, 5], 2);
      // Zoom control bottom-right, clear of the top-right count chip.
      L.control.zoom({ position: "bottomright" }).addTo(map);
      tileRef.current = L.tileLayer(mapTileUrl(dark), {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      const cluster = L.markerClusterGroup({
        // Coverage polygons add visual noise on the cream palette; the count
        // bubble + zoom-on-click already communicate density.
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        spiderfyDistanceMultiplier: 1.4,
        chunkedLoading: true,
        iconCreateFunction: (c: MarkerCluster) => {
          const n = c.getChildCount();
          const { tier, size } = clusterTier(n);
          return L.divIcon({
            html: `<div class="gf-cluster gf-cluster--${tier}">${formatCompact(n)}</div>`,
            className: "gf-cluster-wrap",
            iconSize: L.point(size, size),
          });
        },
      });
      cluster.addTo(map);
      layerRef.current = cluster;
      // Any move we didn't initiate is the visitor exploring; stop auto-fitting.
      map.on("movestart", () => {
        if (!fittingRef.current) userMovedRef.current = true;
      });
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Track the app theme (the toggle flips `.dark` on <html>) and swap basemaps
  // so the map follows light/dark without a remount.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    tileRef.current?.setUrl(mapTileUrl(isDark));
  }, [isDark]);

  // Resolve points whenever the record set changes. A new data set re-enables
  // auto-fit so the map always frames the freshly loaded points.
  useEffect(() => {
    const controller = new AbortController();
    userMovedRef.current = false;
    setResolving(true);
    resolvePointsFor(records, kind, {
      signal: controller.signal,
      onProgress: (pts) => setPoints(pts),
    })
      .then((pts) => setPoints(pts))
      .catch(() => {})
      .finally(() => setResolving(false));
    return () => controller.abort();
  }, [records, kind]);

  // Draw markers (clustered) + auto-fit when points (or the map) change.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer || !ready) return;
    // Re-measure first so fitBounds uses the real container size (it may have
    // laid out after init, or the viewport may have changed).
    map.invalidateSize();
    layer.clearLayers();

    const pinIcon = L.divIcon({
      className: "gf-pin",
      html: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const markers = points.map((p) => {
      const marker = L.marker([p.lat, p.lon], { icon: pinIcon });
      if (p.label) marker.bindTooltip(p.label, { direction: "top", offset: [0, -8] });
      marker.on("click", () => {
        const rec = p.recordId ? recordById.get(p.recordId) : undefined;
        if (rec) onOpen(rec);
        else if (p.did) window.open(accountHref(preferredDidIdentifier(p.did, getCachedProfile(p.did)?.handle)), "_blank", "noopener");
      });
      return marker;
    });
    // Bulk add so markercluster builds the tree once (chunked under the hood).
    layer.addLayers(markers);

    if (points.length > 0 && !userMovedRef.current) {
      const lats = points.map((p) => p.lat);
      const lons = points.map((p) => p.lon);
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const lonSpan = Math.max(...lons) - Math.min(...lons);
      fittingRef.current = true;
      // Frame every point. When the records all sit at one survey site the
      // bounding box collapses to ~zero area, which would slam Leaflet to the
      // deepest street zoom — so fall back to a fixed, readable zoom centered
      // on the cluster. Otherwise fit the whole box with a pixel margin so
      // edge markers aren't clipped, capping how far in a tight (but non-zero)
      // cluster can go. Globally spread pins stay zoomed out to frame them all.
      if (latSpan < 0.01 && lonSpan < 0.01) {
        const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const lon = (Math.min(...lons) + Math.max(...lons)) / 2;
        map.setView([lat, lon], 14, { animate: false });
      } else {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
        map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14, animate: false });
      }
      // Let the programmatic move settle before re-enabling user detection.
      setTimeout(() => {
        fittingRef.current = false;
      }, 0);
    }
  }, [points, recordById, onOpen, ready]);

  const mappedNote =
    resolving && points.length === 0
      ? "Finding map locations…"
      : `${formatNumber(points.length)} ${kind === "site" ? "sites" : "items"} mapped`;

  return (
    <div className="relative">
      <div
        ref={elRef}
        className="h-[68vh] min-h-[440px] w-full overflow-hidden rounded-2xl border border-border-soft bg-surface-sunken"
        style={{ zIndex: 0 }}
      />
      <div className="pointer-events-none absolute right-3 top-3 z-[5] inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-[12.5px] font-medium text-foreground/70 shadow-sm backdrop-blur">
        <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand" />
        {mappedNote}
      </div>
      {kind !== "occurrence" && !resolving && points.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[5] flex justify-center">
          <span className="rounded-full bg-background/90 px-3 py-1.5 text-[12.5px] text-foreground/60 shadow-sm backdrop-blur">
            None of the items shown have a map location yet.
          </span>
        </div>
      )}
    </div>
  );
}
