"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LeafletMouseEvent, Map as LeafletMap, Marker, TileLayer } from "leaflet";
import { ChevronLeftIcon, Loader2Icon, LocateFixedIcon, MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { mapTileUrl } from "@/app/_lib/coords";
import { isValidLocation, roundCoord, type PickedLocation } from "./default-location";

export const LocationPickerModalId = "observation-location-picker";

export type LocationPickerModalProps = {
  /** Already-chosen pin to seed the map with, if any. */
  initial?: PickedLocation | null;
  /** Where to centre the map when there is no chosen pin (e.g. the default site). */
  defaultCenter?: PickedLocation | null;
  onSelect: (location: PickedLocation) => void;
};

const FALLBACK_CENTER: PickedLocation = { lat: 12, lng: 5 };
const GEOLOCATION_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 },
  { enableHighAccuracy: true, timeout: 45_000, maximumAge: 60_000 },
];
const GEOLOCATION_WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 10 * 60_000 };
const GEOLOCATION_TOTAL_TIMEOUT_MS = 60_000;

export function LocationPickerModal({ initial, defaultCenter, onSelect }: LocationPickerModalProps) {
  const t = useTranslations("upload.observations.location");
  const { popModal, stack, hide } = useModal();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const geoWatchRef = useRef<number | null>(null);
  const geoTimeoutRef = useRef<number | null>(null);
  const [picked, setPicked] = useState<PickedLocation | null>(isValidLocation(initial) ? initial : null);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const clearGeoRequest = useCallback(() => {
    if (geoWatchRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
    if (geoTimeoutRef.current != null) {
      window.clearTimeout(geoTimeoutRef.current);
      geoTimeoutRef.current = null;
    }
  }, []);

  const geolocationErrorText = useCallback((error?: GeolocationPositionError | null) => {
    if (typeof window !== "undefined" && !window.isSecureContext) return t("geoInsecure");
    if (!error) return t("geoDenied");
    if (error.code === error.PERMISSION_DENIED) return t("geoBlocked");
    if (error.code === error.POSITION_UNAVAILABLE) return t("geoUnavailable");
    if (error.code === error.TIMEOUT) return t("geoTimeout");
    return t("geoDenied");
  }, [t]);

  const placeMarker = useCallback((lat: number, lng: number) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const next = { lat: roundCoord(lat), lng: roundCoord(lng) };
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({
          className: "gf-pin gf-pin--picker",
          html: "",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      });
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        setPicked({ lat: roundCoord(position.lat), lng: roundCoord(position.lng) });
      });
      marker.addTo(map);
      markerRef.current = marker;
    }
    setPicked(next);
  }, []);

  // Init the map once. Dynamically imported so Leaflet never touches `window`
  // during SSR — mirrors RecordMap.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const dark = document.documentElement.classList.contains("dark");
      const start = isValidLocation(initial)
        ? initial
        : isValidLocation(defaultCenter)
          ? defaultCenter
          : FALLBACK_CENTER;
      const startZoom = isValidLocation(initial) || isValidLocation(defaultCenter) ? 13 : 2;
      const map = L.map(elRef.current, { worldCopyJump: true, minZoom: 1, zoomControl: false }).setView(
        [start.lat, start.lng],
        startZoom,
      );
      L.control.zoom({ position: "bottomright" }).addTo(map);
      tileRef.current = L.tileLayer(mapTileUrl(dark), {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event: LeafletMouseEvent) => placeMarker(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
      if (isValidLocation(initial)) placeMarker(initial.lat, initial.lng);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      clearGeoRequest();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
    // Intentionally run once; `initial`/`defaultCenter` only seed the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError(t("geoUnsupported"));
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGeoError(t("geoInsecure"));
      return;
    }

    clearGeoRequest();
    setGeoError(null);
    setLocating(true);

    let finished = false;
    let lastError: GeolocationPositionError | null = null;

    const finish = (position?: GeolocationPosition, error?: GeolocationPositionError | null) => {
      if (finished) return;
      finished = true;
      clearGeoRequest();
      setLocating(false);

      if (position) {
        const { latitude, longitude } = position.coords;
        mapRef.current?.setView([latitude, longitude], 15, { animate: true });
        placeMarker(latitude, longitude);
        return;
      }

      setGeoError(geolocationErrorText(error ?? lastError));
    };

    geoTimeoutRef.current = window.setTimeout(() => finish(undefined, lastError), GEOLOCATION_TOTAL_TIMEOUT_MS);
    geoWatchRef.current = navigator.geolocation.watchPosition(
      (position) => finish(position),
      (error) => {
        lastError = error;
        if (error.code === error.PERMISSION_DENIED) finish(undefined, error);
      },
      GEOLOCATION_WATCH_OPTIONS,
    );

    const locate = (attemptIndex: number) => {
      navigator.geolocation.getCurrentPosition(
        (position) => finish(position),
        (error) => {
          lastError = error;
          if (error.code === error.PERMISSION_DENIED) {
            finish(undefined, error);
            return;
          }
          if (attemptIndex < GEOLOCATION_ATTEMPTS.length - 1) locate(attemptIndex + 1);
          // Keep the watch alive until the total timeout: some browsers fail
          // one-shot location requests even after permission is granted, but
          // still deliver a position through watchPosition a moment later.
        },
        GEOLOCATION_ATTEMPTS[attemptIndex],
      );
    };

    locate(0);
  }, [clearGeoRequest, geolocationErrorText, placeMarker, t]);

  const handleConfirm = useCallback(() => {
    if (!picked) return;
    onSelect(picked);
    if (stack.length === 1) {
      void hide().then(() => popModal());
    } else {
      popModal();
    }
  }, [picked, onSelect, stack.length, hide, popModal]);

  return (
    <ModalContent className="px-0 py-0" dismissible={false}>
      <div className="sr-only">
        <ModalHeader>
          <ModalTitle>{t("title")}</ModalTitle>
          <ModalDescription>{t("description")}</ModalDescription>
        </ModalHeader>
      </div>
      <div className="px-5 pt-5">
        <h2 className="font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </div>
      <div className="relative mt-4 w-full">
        {!ready && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center bg-muted">
            <Loader2Icon className="animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={elRef} className="h-[420px] w-full" style={{ zIndex: 0 }} />
        {stack.length > 1 && (
          <Button
            className="absolute left-3 top-3 z-[2] rounded-full"
            variant="outline"
            size="icon-sm"
            onClick={() => popModal()}
          >
            <ChevronLeftIcon />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={useMyLocation}
          disabled={locating || !ready}
          className="absolute right-3 top-3 z-[2] bg-background/90 shadow-sm backdrop-blur"
        >
          {locating ? <Loader2Icon className="size-4 animate-spin" /> : <LocateFixedIcon className="size-4" />}
          {t("useMyLocation")}
        </Button>
      </div>
      <div className="flex items-center gap-2 px-5 pt-3 text-sm text-muted-foreground">
        <MapPinIcon className={`size-4 shrink-0 ${picked ? "text-primary" : "text-muted-foreground/50"}`} />
        {picked ? (
          <span className="tabular-nums">{t("picked", { lat: picked.lat, lng: picked.lng })}</span>
        ) : (
          <span>{t("hint")}</span>
        )}
      </div>
      {geoError ? <p className="px-5 pt-1.5 text-xs text-destructive">{geoError}</p> : null}
      <ModalFooter>
        <Button onClick={handleConfirm} disabled={!picked}>
          {t("confirm")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
