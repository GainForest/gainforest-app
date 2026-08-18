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
import { cn } from "@/lib/utils";
import { mapTileUrl } from "@/app/_lib/coords";

export function DeploymentLocationMap({
  lat,
  lon,
  label,
  className,
  heightClass = "h-64",
  compact = false,
}: {
  lat: number;
  lon: number;
  label?: string;
  /** Extra classes for the outer card — e.g. to match a neighbouring panel's radius/border. */
  className?: string;
  /** Height of the map canvas. Defaults to the roomy detail-page size; pass a
   *  shorter one where the map is a compact aside beside another panel. */
  heightClass?: string;
  /** Thumbnail mode: drop the header and zoom control and make the map
   *  non-interactive — a small pinned preview to sit inline beside other
   *  content, e.g. an empty deployment's "no recordings yet" note. */
  compact?: boolean;
}) {
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
          dragging: !compact,
          doubleClickZoom: !compact,
          boxZoom: !compact,
          keyboard: !compact,
          attributionControl: !compact,
        }).setView([lat, lon], 12);
        if (!compact) L.control.zoom({ position: "bottomright" }).addTo(map);
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
  }, [lat, lon, label, compact]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Thumbnail: no header or zoom control, just the pinned canvas in a small
  // rounded frame the caller sizes.
  if (compact) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg border border-border bg-muted/40", className)}>
        <div ref={elRef} className={cn("w-full", heightClass)} style={{ zIndex: 0 }} aria-label={t("mapTitle")} />
      </div>
    );
  }

  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-foreground/[0.04]", className)}>
      <div className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-foreground/75">
        <MapPinIcon className="h-4 w-4 text-primary" aria-hidden />
        {t("mapTitle")}
      </div>
      <div
        ref={elRef}
        className={cn("w-full border-t border-border bg-muted/40", heightClass)}
        style={{ zIndex: 0 }}
        aria-label={t("mapTitle")}
      />
    </section>
  );
}
