"use client";

/**
 * A small, self-contained Leaflet preview of a single deployment's location,
 * matching the themed CARTO tiles used elsewhere. Leaflet is imported
 * dynamically so it never touches `window` during SSR.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, TileLayer } from "leaflet";
import { MapPinIcon, Maximize2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { mapTileUrl } from "@/app/_lib/coords";
import { ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";

export function DeploymentLocationMap({
  lat,
  lon,
  label,
  className,
  heightClass = "h-64",
  compact = false,
  interactive = false,
  expandable = true,
}: {
  lat: number;
  lon: number;
  label?: string;
  /** Extra classes for the outer card — e.g. to match a neighbouring panel's radius/border. */
  className?: string;
  /** Height of the map canvas. Defaults to the roomy detail-page size; pass a
   *  shorter one where the map is a compact aside beside another panel. */
  heightClass?: string;
  /** Thumbnail mode: drop the header and zoom control — a small pinned
   *  preview to sit inline beside other content, e.g. an empty deployment's
   *  "no recordings yet" note. */
  compact?: boolean;
  /** Whether the map itself pans/zooms inline. Off by default: every map is a
   *  static preview that opens the zoomable modal on click. The modal's own
   *  map and the deployment detail page's hero map pass `interactive`. */
  interactive?: boolean;
  /** A static preview opens a larger, zoomable map in a modal when clicked —
   *  the compact thumbnail and the full "Deployment location" card alike. Pass
   *  false for a purely decorative preview (or the modal's own map). */
  expandable?: boolean;
}) {
  const t = useTranslations("common.audiomoth.deployments");
  const modal = useModal();
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
          // Scroll to zoom the interactive map (the modal, the detail hero) —
          // no need to reach for the +/- buttons. Static previews stay inert.
          scrollWheelZoom: interactive,
          dragging: interactive,
          touchZoom: interactive,
          doubleClickZoom: interactive,
          boxZoom: interactive,
          keyboard: interactive,
          attributionControl: interactive,
        }).setView([lat, lon], 12);
        if (interactive) L.control.zoom({ position: "bottomright" }).addTo(map);
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
  }, [lat, lon, label, interactive]);

  // The map can mount while its container is still settling — most notably
  // inside the modal, whose dialog/drawer animates open — so retile whenever
  // the canvas actually changes size instead of trusting one early timeout.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  /** A static thumbnail's click-through: the same spot, blown up and zoomable. */
  const openExpanded = useCallback(() => {
    modal.pushModal(
      {
        id: "deployment-location-map",
        dialogWidth: "max-w-2xl w-[calc(100%-2rem)]",
        content: <DeploymentLocationMapModal lat={lat} lon={lon} label={label} />,
      },
      true,
    );
    void modal.show();
  }, [modal, lat, lon, label]);

  // Every map is a preview that opens the zoomable modal on click, unless the
  // caller asked for an inline-interactive map (the modal's own map, the detail
  // page hero). `canExpand` is the preview case, shared by both render paths.
  const canExpand = expandable && !interactive;

  // Thumbnail: no header, just the pinned canvas in a small rounded frame the
  // caller sizes, with the expand affordance overlaid.
  if (compact) {
    return (
      <div className={cn("group relative overflow-hidden rounded-lg border border-border bg-muted/40", className)}>
        <div ref={elRef} className={cn("w-full", heightClass)} style={{ zIndex: 0 }} aria-label={t("mapTitle")} />
        {canExpand ? <MapExpandButton onClick={openExpanded} label={t("mapExpand")} /> : null}
      </div>
    );
  }

  // Full card: the "Deployment location" header over the pinned canvas. As a
  // preview it carries the same expand affordance as the thumbnail, so both
  // open the same zoomable modal on click.
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-foreground/[0.04]", className)}>
      <div className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-foreground/75">
        <MapPinIcon className="h-4 w-4 text-primary" aria-hidden />
        {t("mapTitle")}
      </div>
      <div className="group relative border-t border-border">
        <div
          ref={elRef}
          className={cn("w-full bg-muted/40", heightClass)}
          style={{ zIndex: 0 }}
          aria-label={t("mapTitle")}
        />
        {canExpand ? <MapExpandButton onClick={openExpanded} label={t("mapExpand")} /> : null}
      </div>
    </section>
  );
}

/** The click-to-zoom affordance shared by the thumbnail and the full card: a
 *  full-bleed button with a corner "expand" badge that strengthens on hover. */
function MapExpandButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      <span className="pointer-events-none absolute bottom-1 end-1 grid size-6 place-items-center rounded-md border border-border/70 bg-background/85 text-foreground/70 shadow-sm transition-colors group-hover:text-foreground">
        <Maximize2Icon className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}

/**
 * The blown-up view behind a thumbnail: the deployment's name and coordinates
 * over a full-width map with the standard zoom control, drag and pinch — the
 * same behaviour as every other map in the app.
 */
function DeploymentLocationMapModal({ lat, lon, label }: { lat: number; lon: number; label?: string }) {
  const t = useTranslations("common.audiomoth.deployments");
  return (
    <ModalContent className="space-y-4">
      <ModalHeader>
        {/* The deployment's name is user-supplied and can be long, so the text
            wraps beside the icon and clears the dialog's close button. */}
        <ModalTitle className="flex items-start gap-2 pe-8">
          <MapPinIcon className="mt-1.5 size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-words">{label || t("mapTitle")}</span>
        </ModalTitle>
        <ModalDescription className="tabular-nums">
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </ModalDescription>
      </ModalHeader>
      <DeploymentLocationMap
        compact
        interactive
        expandable={false}
        lat={lat}
        lon={lon}
        label={label}
        className="rounded-xl"
        heightClass="h-[min(55svh,440px)]"
      />
    </ModalContent>
  );
}
