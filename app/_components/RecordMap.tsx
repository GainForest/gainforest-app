"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { resolvePointsFor, type MapPoint } from "../_lib/coords";
import type { ExplorerRecord, RecordKind } from "../_lib/indexer";
import { formatNumber } from "../_lib/format";
import { accountHref } from "../_lib/urls";

// Map view for the record streams. Vanilla Leaflet (dynamically imported so it
// never touches `window` during SSR) on CARTO Positron tiles to match the
// cream palette. Occurrences plot their own lat/lon; sites plot every Green
// Globe project pin; bumicerts resolve their certified locations. Clicking a
// marker opens the loaded record's drawer, or links out to the org when the
// pin is not part of the loaded page.

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
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
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
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { worldCopyJump: true, minZoom: 1 }).setView([12, 5], 2);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
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
    };
  }, []);

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

  // Draw markers + auto-fit when points (or the map) change.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer || !ready) return;
    // Re-measure first so fitBounds uses the real container size (it may have
    // laid out after init, or the viewport may have changed).
    map.invalidateSize();
    layer.clearLayers();
    for (const p of points) {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 5,
        color: "#2e5840",
        weight: 1.5,
        fillColor: "#3e7053",
        fillOpacity: 0.78,
      });
      if (p.label) marker.bindTooltip(p.label, { direction: "top", offset: [0, -4] });
      marker.on("click", () => {
        const rec = p.recordId ? recordById.get(p.recordId) : undefined;
        if (rec) onOpen(rec);
        else if (p.did) window.open(accountHref(p.did), "_blank", "noopener");
      });
      marker.addTo(layer);
    }
    if (points.length > 0 && !userMovedRef.current) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
      fittingRef.current = true;
      map.fitBounds(bounds.pad(0.08), {
        // Single-cluster data (e.g. one survey site) fits to a tight bound;
        // cap the zoom so it lands on a readable local view rather than the
        // deepest street level. Globally spread pins stay zoomed out.
        maxZoom: points.length === 1 ? 9 : 12,
        animate: false,
      });
      // Let the programmatic move settle before re-enabling user detection.
      setTimeout(() => {
        fittingRef.current = false;
      }, 0);
    }
  }, [points, recordById, onOpen, ready]);

  const mappedNote =
    resolving && points.length === 0
      ? "Resolving locations…"
      : `${formatNumber(points.length)} ${kind === "site" ? "sites" : "records"} mapped`;

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
            None of the loaded records have a resolved location yet.
          </span>
        </div>
      )}
    </div>
  );
}
