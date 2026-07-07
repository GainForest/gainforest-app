"use client";

/**
 * A small, self-contained Leaflet preview of a single deployment's location,
 * matching the themed CARTO tiles used elsewhere. Leaflet is imported
 * dynamically so it never touches `window` during SSR.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, TileLayer } from "leaflet";
import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { mapTileUrl } from "@/app/_lib/coords";

export function DeploymentLocationMap({ lat, lon, label }: { lat: number; lon: number; label?: string }) {
  const t = useTranslations("common.audiomoth.deployments");
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const [isDark, setIsDark] = useState(false);

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
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current) return;

      const pinIcon = L.divIcon({ className: "gf-pin", html: "", iconSize: [14, 14], iconAnchor: [7, 7] });

      if (!mapRef.current) {
        const dark = document.documentElement.classList.contains("dark");
        const map = L.map(elRef.current, {
          worldCopyJump: true,
          minZoom: 1,
          zoomControl: false,
          scrollWheelZoom: false,
        }).setView([lat, lon], 12);
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
      const marker = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
      if (label) marker.bindTooltip(label, { direction: "top", offset: [0, -10], opacity: 1 });
      markerRef.current = marker;
      map.setView([lat, lon], 13, { animate: false });
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, label]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-foreground/[0.04]">
      <div className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-foreground/75">
        <MapPinIcon className="h-4 w-4 text-primary" aria-hidden />
        {t("mapTitle")}
      </div>
      <div
        ref={elRef}
        className="h-64 w-full border-t border-border bg-muted/40"
        style={{ zIndex: 0 }}
        aria-label={t("mapTitle")}
      />
    </section>
  );
}
