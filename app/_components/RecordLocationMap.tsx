"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, TileLayer } from "leaflet";
import { MapPinIcon } from "lucide-react";
import { mapTileUrl, resolvePointForRecord, type MapPoint } from "../_lib/coords";
import type { ExplorerRecord } from "../_lib/indexer";

export function RecordLocationMap({ record }: { record: ExplorerRecord }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [isDark, setIsDark] = useState(false);

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
      markerRef.current = L.marker([point.lat, point.lon], { icon: pinIcon })
        .bindTooltip(point.label, { direction: "top", offset: [0, -8] })
        .addTo(map);
      map.setView([point.lat, point.lon], 12, { animate: false });
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
    };
  }, [point]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
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
