"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { LeafletMouseEvent, Map as LeafletMap, Marker, TileLayer } from "leaflet";
import { ChevronLeftIcon, LayersIcon, Loader2Icon, LocateFixedIcon, MapPinIcon, SearchIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { isValidLocation, roundCoord, type PickedLocation } from "./default-location";

export const LocationPickerModalId = "observation-location-picker";

const LAYER_OPTIONS = [
  { id: "streets", labelKey: "layerStreets" },
  { id: "simple", labelKey: "layerSimple" },
  { id: "satellite", labelKey: "layerSatellite" },
  { id: "terrain", labelKey: "layerTerrain" },
] as const;
type LayerId = (typeof LAYER_OPTIONS)[number]["id"];

export type LocationPickerModalProps = {
  /** Already-chosen pin to seed the map with, if any. */
  initial?: PickedLocation | null;
  /** Where to centre the map when there is no chosen pin (e.g. the default site). */
  defaultCenter?: PickedLocation | null;
  onSelect: (location: PickedLocation) => void;
};

type LocationSearchResult = PickedLocation & {
  id: string;
  name: string;
  detail: string;
};

type RawLocationSearchResult = {
  place_id?: number | string;
  osm_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
};

const FALLBACK_CENTER: PickedLocation = { lat: 12, lng: 5 };
const LOCATION_SEARCH_LIMIT = 5;
const LOCATION_SEARCH_MIN_CHARS = 2;
const LOCATION_SEARCH_ZOOM = 14;
const GEOLOCATION_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 },
  { enableHighAccuracy: true, timeout: 45_000, maximumAge: 60_000 },
];
const GEOLOCATION_WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 10 * 60_000 };
const GEOLOCATION_TOTAL_TIMEOUT_MS = 60_000;

function mapLocationSearchResult(raw: RawLocationSearchResult): LocationSearchResult | null {
  const lat = Number.parseFloat(raw.lat ?? "");
  const lng = Number.parseFloat(raw.lon ?? "");
  const displayName = raw.display_name?.trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !displayName) return null;

  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const name = raw.name?.trim() || parts[0] || displayName;
  const detail = parts.slice(name === parts[0] ? 1 : 0).join(", ");

  return {
    id: String(raw.place_id ?? raw.osm_id ?? `${lat},${lng},${displayName}`),
    name,
    detail,
    lat: roundCoord(lat),
    lng: roundCoord(lng),
  };
}

export function LocationPickerModal({ initial, defaultCenter, onSelect }: LocationPickerModalProps) {
  const t = useTranslations("upload.observations.location");
  const locale = useLocale();
  const { popModal, stack, hide } = useModal();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const layersRef = useRef<Record<LayerId, TileLayer> | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const geoWatchRef = useRef<number | null>(null);
  const geoTimeoutRef = useRef<number | null>(null);
  const autoRequestedRef = useRef(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [picked, setPicked] = useState<PickedLocation | null>(isValidLocation(initial) ? initial : null);
  const [activeLayer, setActiveLayer] = useState<LayerId>("streets");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "success" | "empty" | "error" | "tooShort">("idle");
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

  const clearSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchQuery("");
    setSearchResults([]);
    setSearchStatus("idle");
  }, []);

  const searchLocations = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    searchAbortRef.current?.abort();
    setSearchResults([]);

    if (query.length < LOCATION_SEARCH_MIN_CHARS) {
      setSearchStatus("tooShort");
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchStatus("loading");

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        limit: String(LOCATION_SEARCH_LIMIT),
        q: query,
        "accept-language": locale,
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Location search failed");
      const data: unknown = await response.json();
      const results = Array.isArray(data)
        ? data.map((item) => mapLocationSearchResult(item as RawLocationSearchResult)).filter((item): item is LocationSearchResult => Boolean(item))
        : [];
      setSearchResults(results);
      setSearchStatus(results.length > 0 ? "success" : "empty");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSearchStatus("error");
    } finally {
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    }
  }, [locale, searchQuery]);

  const chooseSearchResult = useCallback((result: LocationSearchResult) => {
    mapRef.current?.setView([result.lat, result.lng], LOCATION_SEARCH_ZOOM, { animate: true });
    placeMarker(result.lat, result.lng);
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearchStatus("idle");
  }, [placeMarker]);

  // Init the map once. Dynamically imported so Leaflet never touches `window`
  // during SSR — mirrors RecordMap.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
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
      // Selectable basemaps; "Streets" (OpenStreetMap) is the default. The
      // switcher UI is rendered in React (see the overlay buttons below).
      const layers: Record<LayerId, TileLayer> = {
        streets: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }),
        simple: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        }),
        satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          attribution: "Imagery &copy; <a href=\"https://www.esri.com\">Esri</a>, Maxar, Earthstar Geographics",
          maxZoom: 19,
        }),
        terrain: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
          subdomains: "abc",
          maxZoom: 17,
        }),
      };
      layersRef.current = layers;
      tileRef.current = layers.streets;
      layers.streets.addTo(map);
      map.on("click", (event: LeafletMouseEvent) => placeMarker(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
      if (isValidLocation(initial)) placeMarker(initial.lat, initial.lng);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      clearGeoRequest();
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
      layersRef.current = null;
    };
    // Intentionally run once; `initial`/`defaultCenter` only seed the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectLayer = useCallback((id: LayerId) => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    if (tileRef.current && map.hasLayer(tileRef.current)) map.removeLayer(tileRef.current);
    layers[id].addTo(map);
    tileRef.current = layers[id];
    setActiveLayer(id);
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

  // Proactively ask for location access the moment the picker opens for a fresh
  // observation. With no pin chosen yet and the site not already blocked, fire
  // the geolocation request so the browser surfaces its native permission prompt
  // straight away — the observer no longer has to discover and tap "Use my
  // location" before being asked.
  useEffect(() => {
    if (!ready || autoRequestedRef.current) return;
    if (isValidLocation(initial)) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (typeof window !== "undefined" && !window.isSecureContext) return;
    autoRequestedRef.current = true;
    let cancelled = false;
    void (async () => {
      // Skip the auto-request when the site is already blocked — re-firing it
      // would only flash the "blocked" banner the instant the picker appears.
      // When the Permissions API is unavailable (older Safari), fall through and
      // ask anyway so a never-prompted user still gets the native dialog.
      try {
        const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (cancelled) return;
        if (status?.state === "denied") return;
      } catch {
        // Permissions API not supported — let the geolocation call drive the prompt.
      }
      if (cancelled) return;
      useMyLocation();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, initial, useMyLocation]);

  const closeModal = useCallback(() => {
    clearGeoRequest();
    if (stack.length === 1) {
      void hide().then(() => popModal());
    } else {
      popModal();
    }
  }, [clearGeoRequest, stack.length, hide, popModal]);

  const handleConfirm = useCallback(() => {
    if (!picked) return;
    onSelect(picked);
    closeModal();
  }, [picked, onSelect, closeModal]);

  return (
    <ModalContent className="space-y-4" dismissible={false}>
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
          <ModalTitle>{t("title")}</ModalTitle>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={closeModal}
            aria-label={t("close")}
            className="-mr-1 -mt-1 rounded-full"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <ModalDescription>{t("description")}</ModalDescription>
      </ModalHeader>
      <form className="space-y-2" onSubmit={searchLocations}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                if (searchStatus !== "idle") setSearchStatus("idle");
                if (searchResults.length > 0) setSearchResults([]);
              }}
              aria-label={t("searchLabel")}
              placeholder={t("searchPlaceholder")}
              className="pl-9 pr-9"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={clearSearch}
                aria-label={t("searchClear")}
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-full"
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <Button type="submit" variant="outline" disabled={searchStatus === "loading"}>
            {searchStatus === "loading" ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
            {t("searchButton")}
          </Button>
        </div>
        {searchResults.length > 0 ? (
          <div className="overflow-hidden rounded-xl border bg-background shadow-sm" aria-label={t("searchResults")}>
            {searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => chooseSearchResult(result)}
                className="flex w-full flex-col gap-1 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                aria-label={t("searchResultAria", { name: result.name })}
              >
                <span className="text-sm font-medium text-foreground">{result.name}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{result.detail || t("searchResultFallback")}</span>
              </button>
            ))}
          </div>
        ) : searchStatus === "empty" || searchStatus === "error" || searchStatus === "tooShort" ? (
          <p className="px-1 text-xs text-muted-foreground">
            {searchStatus === "empty" ? t("searchNoResults") : searchStatus === "tooShort" ? t("searchShortQuery") : t("searchError")}
          </p>
        ) : null}
      </form>
      <div className="relative w-full">
        {!ready && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-xl bg-muted">
            <Loader2Icon className="animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={elRef} className="h-[420px] w-full overflow-hidden rounded-xl" style={{ zIndex: 0 }} />
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
        {ready && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute bottom-3 left-3 z-[2] bg-background/90 shadow-sm backdrop-blur"
              >
                <LayersIcon className="size-4" />
                {t(LAYER_OPTIONS.find((option) => option.id === activeLayer)?.labelKey ?? "layerStreets")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="z-[1000]">
              <DropdownMenuRadioGroup value={activeLayer} onValueChange={(value) => selectLayer(value as LayerId)}>
                {LAYER_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    {t(option.labelKey)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPinIcon className={`size-4 shrink-0 ${picked ? "text-primary" : "text-muted-foreground/50"}`} />
        {picked ? (
          <span className="tabular-nums">{t("picked", { lat: picked.lat, lng: picked.lng })}</span>
        ) : (
          <span>{t("hint")}</span>
        )}
        {geoError ? <span className="ml-auto text-xs text-destructive">{geoError}</span> : null}
      </div>
      <ModalFooter>
        <Button type="button" variant="outline" onClick={closeModal}>
          {t("cancel")}
        </Button>
        <Button onClick={handleConfirm} disabled={!picked}>
          {t("confirm")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
