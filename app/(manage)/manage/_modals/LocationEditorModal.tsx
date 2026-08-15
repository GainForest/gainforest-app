"use client";

/**
 * Editor for an organization's declared location ("where the org is based").
 *
 * Works like adding a site, adapted from Ma Earth's location flow: search for
 * a place (fuzzy, as-you-type), or enter coordinates by hand; fine-tune by
 * dragging the pin on a satellite preview; and optionally publish only an
 * approximate location — a ~10 km area under a region/country name instead of
 * the exact point.
 *
 * The modal only collects the choice. Publishing (record creation + the org
 * record update) stays with the caller, like every other hero editor.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2Icon, MapPinIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { countryFlag } from "@/app/_lib/format";
import {
  APPROXIMATE_CIRCLE_RADIUS_KM,
  circlePolygonFeature,
  coarsePlaceLabel,
  type GeocodedPlace,
  type OrgLocationChoice,
} from "@/app/_lib/org-location-geometry";

export const LocationEditorModalId = "location-editor";

const SEARCH_DEBOUNCE_MS = 300;

type LocationEditorModalProps = {
  /** The currently saved location, for the header + the Remove action. */
  current: { name: string | null; countryCode: string | null } | null;
  /** Called with the steward's choice; null means "remove the location". */
  onConfirm: (choice: OrgLocationChoice | null) => void;
};

/** Wire shape of `/api/geocode` results (shared with the observations picker). */
type GeocodeResult = {
  name: string;
  detail: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  region: string | null;
  country: string | null;
  kind: "country" | "place";
};

function toPlace(result: GeocodeResult): GeocodedPlace {
  return {
    name: result.kind === "country" || !result.detail ? result.name : `${result.name}, ${result.detail}`,
    latitude: result.lat,
    longitude: result.lng,
    countryCode: result.countryCode,
    region: result.region,
    country: result.country,
    kind: result.kind,
  };
}

async function searchPlaces(query: string, signal: AbortSignal): Promise<GeocodedPlace[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error("search failed");
  const data = (await response.json()) as { results?: GeocodeResult[] };
  return (data.results ?? []).map(toPlace);
}

async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedPlace | null> {
  try {
    const response = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { results?: GeocodeResult[] };
    const first = data.results?.[0];
    return first ? toPlace(first) : null;
  } catch {
    return null;
  }
}

/** Satellite preview: pin for exact locations, ~10 km circle for approximate. */
function LocationPreviewMap({
  place,
  approximate,
  onDragged,
}: {
  place: GeocodedPlace | null;
  approximate: boolean;
  onDragged: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onDraggedRef = useRef(onDragged);
  onDraggedRef.current = onDragged;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 17,
            attribution: "Esri, Maxar, Earthstar Geographics",
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      map.addSource("approx-circle", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "approx-circle-fill",
        type: "fill",
        source: "approx-circle",
        paint: { "fill-color": "#38BDF8", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "approx-circle-line",
        type: "line",
        source: "approx-circle",
        paint: { "line-color": "#38BDF8", "line-width": 2 },
      });
    });
    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyCircle = () => {
      const source = map.getSource("approx-circle") as maplibregl.GeoJSONSource | undefined;
      source?.setData(
        place && approximate
          ? circlePolygonFeature(place.latitude, place.longitude)
          : { type: "FeatureCollection", features: [] },
      );
    };
    if (map.isStyleLoaded()) applyCircle();
    else map.once("load", applyCircle);

    if (!place) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: "#38BDF8", draggable: true })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        onDraggedRef.current(lat, lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([place.longitude, place.latitude]);
    }

    map.flyTo({
      center: [place.longitude, place.latitude],
      zoom: approximate ? 8 : place.kind === "country" ? 4 : 10,
      duration: 800,
    });
  }, [place, approximate]);

  return <div ref={containerRef} className="h-52 w-full overflow-hidden rounded-xl border border-border" />;
}

export function LocationEditorModal({ current, onConfirm }: LocationEditorModalProps) {
  const t = useTranslations("upload.dashboardClient.locationEditor");
  const { stack, popModal, hide } = useModal();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<GeocodedPlace | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [latDraft, setLatDraft] = useState("");
  const [lonDraft, setLonDraft] = useState("");
  const [approximate, setApproximate] = useState(false);
  // Guards against a slow reverse-geocode overwriting a newer drag/entry.
  const reverseRequestId = useRef(0);

  // Debounced place search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(trimmed, controller.signal)
        .then((places) => {
          setResults(places);
          setSearching(false);
        })
        .catch((err) => {
          if (controller.signal.aborted || (err as Error).name === "AbortError") return;
          setSearchError(true);
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const close = useCallback(() => {
    if (stack.length === 1) {
      void hide().then(() => popModal());
    } else {
      popModal();
    }
  }, [hide, popModal, stack.length]);

  const pickResult = (place: GeocodedPlace) => {
    setSelected(place);
    setResults([]);
    setQuery("");
  };

  /** New coordinates from the pin drag or manual entry: keep them, then let a
   *  reverse geocode fill in the name/region — never the other way round. */
  const adoptCoordinates = useCallback(async (latitude: number, longitude: number) => {
    const fallbackName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    const base: GeocodedPlace = {
      name: fallbackName,
      latitude,
      longitude,
      countryCode: null,
      region: null,
      country: null,
      kind: "place",
    };
    setSelected(base);
    const requestId = ++reverseRequestId.current;
    const resolved = await reverseGeocode(latitude, longitude);
    if (requestId !== reverseRequestId.current || !resolved) return;
    setSelected({ ...resolved, latitude, longitude });
  }, []);

  const commitManual = () => {
    const latitude = Number(latDraft);
    const longitude = Number(lonDraft);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    void adoptCoordinates(latitude, longitude);
  };

  const manualValid = (() => {
    const latitude = Number(latDraft);
    const longitude = Number(lonDraft);
    return (
      latDraft.trim() !== "" &&
      lonDraft.trim() !== "" &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    );
  })();

  const approximateLabel = selected ? coarsePlaceLabel(selected) : null;

  const handleSave = () => {
    if (!selected) return;
    onConfirm({ place: selected, approximate });
    close();
  };

  const handleRemove = () => {
    onConfirm(null);
    close();
  };

  return (
    <ModalContent>
      <ModalHeader>
        <ModalTitle>{t("title")}</ModalTitle>
        <ModalDescription>
          {current?.name
            ? t("descriptionWithCurrent", { location: current.name })
            : t("description")}
        </ModalDescription>
      </ModalHeader>

      <div className="mt-4 flex flex-col gap-3">
        {!manualMode ? (
          <div className="relative">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="pl-9"
                autoFocus
              />
              {searching ? (
                <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
            </div>
            {results.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-background p-1 shadow-lg">
                {results.map((place, index) => (
                  <li key={`${place.latitude},${place.longitude},${index}`}>
                    <button
                      type="button"
                      onClick={() => pickResult(place)}
                      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      {place.kind === "country" && place.countryCode ? (
                        <span className="mt-0.5 text-base leading-none" aria-hidden>{countryFlag(place.countryCode)}</span>
                      ) : (
                        <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="min-w-0 break-words">{place.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {searchError
                ? t("searchUnavailable")
                : query.trim().length >= 2 && !searching && results.length === 0
                  ? t("noResults")
                  : null}{" "}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setManualMode(true)}>
                {t("enterCoordinates")}
              </button>
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("latitude")}
                <Input
                  inputMode="decimal"
                  placeholder="17.8807"
                  value={latDraft}
                  onChange={(e) => setLatDraft(e.target.value)}
                  onBlur={commitManual}
                  onKeyDown={(e) => { if (e.key === "Enter") commitManual(); }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("longitude")}
                <Input
                  inputMode="decimal"
                  placeholder="102.7340"
                  value={lonDraft}
                  onChange={(e) => setLonDraft(e.target.value)}
                  onBlur={commitManual}
                  onKeyDown={(e) => { if (e.key === "Enter") commitManual(); }}
                />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {!manualValid && (latDraft.trim() || lonDraft.trim()) ? `${t("invalidCoordinates")} ` : null}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setManualMode(false)}>
                {t("searchInstead")}
              </button>
            </p>
          </div>
        )}

        {selected ? (
          <p className="flex items-start gap-1.5 text-sm text-foreground">
            <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 break-words">{selected.name}</span>
          </p>
        ) : null}

        <LocationPreviewMap
          place={selected}
          approximate={approximate}
          onDragged={(latitude, longitude) => void adoptCoordinates(latitude, longitude)}
        />
        {selected ? <p className="text-xs text-muted-foreground">{t("dragHint")}</p> : null}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
          <input
            type="checkbox"
            checked={approximate}
            onChange={(e) => setApproximate(e.target.checked)}
            className="mt-0.5 accent-[var(--primary)]"
          />
          <span className="min-w-0 text-sm">
            <span className="font-medium text-foreground">{t("approximateLabel")}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {approximate && approximateLabel
                ? t("approximateHintWithLabel", { radius: APPROXIMATE_CIRCLE_RADIUS_KM, label: approximateLabel })
                : t("approximateHint", { radius: APPROXIMATE_CIRCLE_RADIUS_KM })}
            </span>
          </span>
        </label>
      </div>

      <ModalFooter className="mt-4 flex-row items-center justify-between gap-2">
        {current ? (
          <Button variant="ghost" className="text-muted-foreground" onClick={handleRemove}>
            {t("remove")}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={handleSave} disabled={!selected}>
          {t("save")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
