"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, Marker, TileLayer } from "leaflet";
import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { mapTileUrl, resolvePointForRecord, type MapPoint } from "../_lib/coords";
import type { ExplorerRecord } from "../_lib/indexer";
import { hydrateRecordTip, recordTipHtml, type MapTipLabels } from "../_lib/map-tooltip";

// True when the GeoJSON carries a geometry with real extent (a line/polygon),
// i.e. something worth drawing as a shape rather than collapsing to one pin.
function hasDrawableArea(geo: unknown): boolean {
  if (!geo || typeof geo !== "object") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON is deeply variadic
  const g = geo as any;
  switch (g.type) {
    case "FeatureCollection":
      return Array.isArray(g.features) && g.features.some((f: unknown) => hasDrawableArea((f as any)?.geometry));
    case "Feature":
      return hasDrawableArea(g.geometry);
    case "Polygon":
    case "MultiPolygon":
    case "LineString":
    case "MultiLineString":
      return Array.isArray(g.coordinates) && g.coordinates.length > 0;
    case "GeometryCollection":
      return Array.isArray(g.geometries) && g.geometries.some((geom: unknown) => hasDrawableArea(geom));
    default:
      return false;
  }
}

// The themed accent colour for the boundary, read from the live CSS variable so
// it follows light/dark. Falls back to the brand green if unavailable (SSR).
function readPrimaryColor(): string {
  if (typeof window === "undefined") return "#2f6b3a";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return value || "#2f6b3a";
}

export function RecordLocationMap({ record }: { record: ExplorerRecord }) {
  const t = useTranslations("marketplace.map");
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const geoLayerRef = useRef<LeafletGeoJSON | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [isDark, setIsDark] = useState(false);
  // Latest translated tooltip labels, read inside the marker closure.
  const labelsRef = useRef<MapTipLabels>({ unidentified: t("unidentified") });
  labelsRef.current = { unidentified: t("unidentified") };

  useEffect(() => {
    const controller = new AbortController();
    setPoint(null);
    resolvePointForRecord(record, controller.signal)
      .then((nextPoint) => {
        if (!controller.signal.aborted) setPoint(nextPoint);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setPoint(null);
      });
    return () => controller.abort();
  }, [record]);

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

  useEffect(() => {
    if (point || !mapRef.current) return;
    mapRef.current.remove();
    mapRef.current = null;
    markerRef.current = null;
    geoLayerRef.current = null;
    tileRef.current = null;
  }, [point]);

  useEffect(() => {
    if (!point || !elRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current) return;
      LRef.current = L;

      const pinIcon = L.divIcon({
        className: "gf-pin",
        html: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      if (!mapRef.current) {
        const dark = document.documentElement.classList.contains("dark");
        const map = L.map(elRef.current, {
          worldCopyJump: true,
          minZoom: 1,
          zoomControl: false,
          scrollWheelZoom: false,
        }).setView([point.lat, point.lon], 12);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        tileRef.current = L.tileLayer(mapTileUrl(dark), {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
      }

      const map = mapRef.current;
      markerRef.current?.remove();
      markerRef.current = null;
      geoLayerRef.current?.remove();
      geoLayerRef.current = null;
      const tip = { lat: point.lat, lon: point.lon };

      // When the location resolved to a real polygon/feature, draw the actual
      // boundary and frame it to its bounds; otherwise fall back to a single
      // centroid pin.
      if (point.geojson && hasDrawableArea(point.geojson)) {
        const accent = readPrimaryColor();
        const layer = L.geoJSON(point.geojson, {
          style: { color: accent, weight: 2, fillColor: accent, fillOpacity: 0.18 },
          pointToLayer: (_feature, latlng) => L.marker(latlng, { icon: pinIcon }),
        })
          .bindTooltip(recordTipHtml(record, tip, labelsRef.current), {
            direction: "top",
            offset: [0, -10],
            opacity: 1,
            sticky: true,
            className: "gf-occ-tip",
          })
          .addTo(map);
        layer.on("tooltipopen", () => void hydrateRecordTip(layer, record, tip, labelsRef.current));
        geoLayerRef.current = layer;
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15, animate: false });
        else map.setView([point.lat, point.lon], 12, { animate: false });
      } else {
        const marker = L.marker([point.lat, point.lon], { icon: pinIcon })
          .bindTooltip(recordTipHtml(record, tip, labelsRef.current), {
            direction: "top",
            offset: [0, -10],
            opacity: 1,
            className: "gf-occ-tip",
          })
          .addTo(map);
        marker.on("tooltipopen", () => void hydrateRecordTip(marker, record, tip, labelsRef.current));
        markerRef.current = marker;
        map.setView([point.lat, point.lon], 12, { animate: false });
      }
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
    };
  }, [point, record]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      geoLayerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  if (!point) return null;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-border-soft bg-foreground/[0.04]">
      <div className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-foreground/75">
        <MapPinIcon className="h-4 w-4 text-primary" aria-hidden />
        Map location
      </div>
      <div
        ref={elRef}
        className="h-56 w-full border-t border-border-soft bg-surface-sunken"
        style={{ zIndex: 0 }}
        aria-label="Map showing this place"
      />
    </section>
  );
}
