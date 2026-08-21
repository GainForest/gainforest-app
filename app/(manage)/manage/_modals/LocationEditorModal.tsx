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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { countryCodeFromLocationLabel, getCountry } from "@/app/_lib/countries";
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
  /** The currently saved location, for the header, the Remove action, and
   *  seeding the map. For an approximate location the coordinates are the
   *  published circle's center — shown as context, never re-saved as-is. */
  current: {
    name: string | null;
    countryCode: string | null;
    latitude?: number | null;
    longitude?: number | null;
    approximate?: boolean;
    /** True when the location hasn't been published yet (e.g. a pick made
     *  while creating the organization) — its exact point stays editable
     *  even when marked approximate. */
    draft?: boolean;
  } | null;
  /** Override the header copy when the editor stands for something other
   *  than an organization's declared location (a recorder deployment). */
  title?: string;
  description?: string;
  /**
   * Exact-point mode, for callers whose location is a measurement rather
   * than a declared, name-first place — e.g. where a recorder stood:
   *
   *  - the "approximate location" option is hidden — fuzzing a measurement
   *    would corrupt it;
   *  - a whole-country search result becomes an ordinary draggable pin at
   *    the country's center instead of a flagged area — the thing being
   *    placed stood at one spot, so every pick must carry exact
   *    coordinates;
   *  - the Remove action is hidden unless `allowRemove` is set — a measurement
   *    is normally set or corrected, but callers that support clearing can
   *    opt into it explicitly.
   */
  pointOnly?: boolean;
  /** Show the existing saved-location removal action even in exact-point mode. */
  allowRemove?: boolean;
  /** Called with the steward's choice; null means "remove the location".
   *  Return a promise and the modal stays open and locked until the save
   *  lands, showing the failure right here if it doesn't. A void return
   *  closes immediately (used by the creation flow, where the pick is local
   *  state until the final step). */
  onConfirm: (choice: OrgLocationChoice | null) => void | Promise<void>;
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

/** Satellite preview: pin for exact locations, ~10 km circle for approximate.
 *  With no selection yet, `seed` shows the currently saved area as context. */
function LocationPreviewMap({
  place,
  approximate,
  seed,
  onDragged,
}: {
  place: GeocodedPlace | null;
  approximate: boolean;
  /** The saved approximate circle's center, shown until a new pick is made. */
  seed: { latitude: number; longitude: number } | null;
  onDragged: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Identity of the marker currently on the map — "point" for the draggable
  // pin, or the flag emoji for a country — so it can be rebuilt whenever the
  // pick changes between a country (flag, fixed) and a point (pin, draggable),
  // or between two different countries (the flag element isn't reusable).
  const markerKeyRef = useRef<string | null>(null);
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

    // The circle marks whichever approximate area applies right now: the new
    // pick when there is one, otherwise the saved area shown as context.
    const circleCenter = place && approximate ? place : !place && seed ? seed : null;
    const applyCircle = () => {
      const source = map.getSource("approx-circle") as maplibregl.GeoJSONSource | undefined;
      source?.setData(
        circleCenter
          ? circlePolygonFeature(circleCenter.latitude, circleCenter.longitude)
          : { type: "FeatureCollection", features: [] },
      );
    };
    if (map.isStyleLoaded()) applyCircle();
    else map.once("load", applyCircle);

    if (!place) {
      markerRef.current?.remove();
      markerRef.current = null;
      markerKeyRef.current = null;
      if (seed) map.flyTo({ center: [seed.longitude, seed.latitude], zoom: 8, duration: 800 });
      return;
    }

    // A whole country is an area, not an address: mark it with its flag and
    // don't offer a drag handle that would imply a precise spot.
    const isWholeCountry = place.kind === "country" && !approximate;
    const flag = isWholeCountry ? getCountry(place.countryCode)?.emoji ?? null : null;
    const markerKey = flag ?? (isWholeCountry ? "country-pin" : "point");
    if (markerRef.current && markerKeyRef.current !== markerKey) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (!markerRef.current) {
      let marker: maplibregl.Marker;
      if (flag) {
        const element = document.createElement("div");
        element.textContent = flag;
        element.style.fontSize = "30px";
        element.style.lineHeight = "1";
        element.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,.5))";
        marker = new maplibregl.Marker({ element });
      } else {
        marker = new maplibregl.Marker({ color: "#38BDF8", draggable: !isWholeCountry });
      }
      marker.setLngLat([place.longitude, place.latitude]).addTo(map);
      if (!isWholeCountry) {
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLngLat();
          onDraggedRef.current(lat, lng);
        });
      }
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([place.longitude, place.latitude]);
    }
    markerKeyRef.current = markerKey;

    map.flyTo({
      center: [place.longitude, place.latitude],
      zoom: approximate ? 8 : place.kind === "country" ? 4 : 10,
      duration: 800,
    });
  }, [place, approximate, seed]);

  return <div ref={containerRef} className="h-52 w-full overflow-hidden rounded-xl border border-border" />;
}

export function LocationEditorModal({
  current,
  title,
  description,
  pointOnly = false,
  allowRemove = false,
  onConfirm,
}: LocationEditorModalProps) {
  const t = useTranslations("upload.dashboardClient.locationEditor");
  const { stack, popModal, hide } = useModal();

  // Seed the editor with the saved location so the map opens on it. An exact
  // point becomes the working selection (drag to adjust); an approximate one
  // is context only — re-saving its published center as a fresh pick would
  // offset the offset and drift the circle away from the true spot.
  // A saved country stores no coordinates — a country is an area, not a
  // point. The flag marker's position is this editor's own convention: the
  // country table's centroid, looked up at render time, never published.
  const conventionCoordinates =
    current && typeof current.latitude !== "number" && current.countryCode
      ? getCountry(current.countryCode)?.coordinates ?? null
      : null;
  const seedLatitude = typeof current?.latitude === "number" ? current.latitude : conventionCoordinates?.latitude;
  const seedLongitude = typeof current?.longitude === "number" ? current.longitude : conventionCoordinates?.longitude;
  const hasSavedCoordinates = typeof seedLatitude === "number" && typeof seedLongitude === "number";
  const seededSelection: GeocodedPlace | null = useMemo(
    () =>
      current && hasSavedCoordinates && (!current.approximate || current.draft)
        ? {
            name: current.name ?? `${seedLatitude!.toFixed(5)}, ${seedLongitude!.toFixed(5)}`,
            latitude: seedLatitude!,
            longitude: seedLongitude!,
            countryCode: current.countryCode,
            region: null,
            // Recovered from the saved name so "share only an approximate
            // location" on the seeded pick can still publish a coarse label.
            country: getCountry(current.countryCode ?? countryCodeFromLocationLabel(current.name))?.name ?? null,
            kind: current.countryCode ? "country" : "place",
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` is fixed for the life of the modal
    [],
  );
  const approximateSeed = useMemo(
    () =>
      current && hasSavedCoordinates && current.approximate && !current.draft
        ? { latitude: seedLatitude!, longitude: seedLongitude! }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` is fixed for the life of the modal
    [],
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<GeocodedPlace | null>(seededSelection);
  const [manualMode, setManualMode] = useState(false);
  const [latDraft, setLatDraft] = useState("");
  const [lonDraft, setLonDraft] = useState("");
  const [approximate, setApproximate] = useState(!pointOnly && Boolean(current?.approximate));
  // Save stays disabled until something actually changes — blindly re-saving
  // the seeded location would only mint duplicate records.
  const [dirty, setDirty] = useState(false);
  // The save is one server-side request; while it runs the modal stays
  // open and locked so the result is always seen.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    // Placing an exact point: a country result is only a coarse starting
    // spot, so it lands as a normal draggable pin at the country's center.
    setSelected(pointOnly && place.kind === "country" ? { ...place, kind: "place" } : place);
    setDirty(true);
    // A country is already as coarse as it gets; a ~10 km circle inside it
    // would publish less truth, not more.
    if (!pointOnly && place.kind === "country") setApproximate(false);
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
    setDirty(true);
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
  const selectedIsWholeCountry = selected?.kind === "country" && !approximate;
  const selectedFlag = getCountry(selected?.countryCode)?.emoji ?? null;

  const runConfirm = (choice: OrgLocationChoice | null) => {
    setSaveError(null);
    const result = onConfirm(choice);
    if (!result || typeof result.then !== "function") {
      // Synchronous caller (creation flow): nothing is being published.
      close();
      return;
    }
    setSaving(true);
    result
      .then(() => close())
      .catch((error: unknown) => {
        setSaving(false);
        setSaveError(error instanceof Error ? error.message : t("saveFailed"));
      });
  };

  const handleSave = () => {
    if (!selected || saving) return;
    runConfirm({ place: selected, approximate });
  };

  const handleRemove = () => {
    if (saving) return;
    runConfirm(null);
  };

  return (
    <ModalContent dismissible={!saving}>
      <ModalHeader>
        <ModalTitle>{title ?? t("title")}</ModalTitle>
        <ModalDescription>
          {description ??
            (current?.name
              ? t("descriptionWithCurrent", { location: current.name })
              : t("description"))}
        </ModalDescription>
      </ModalHeader>

      <div className="mt-4 flex flex-col gap-3">
        {!manualMode ? (
          <div className="relative">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="pl-9"
                autoFocus
              />
              {searching ? (
                <Loader2Icon className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
            </div>
            {results.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-background p-1 shadow-lg">
                {results.map((place, index) => (
                  <li key={`${place.latitude},${place.longitude},${index}`}>
                    <button
                      type="button"
                      onClick={() => pickResult(place)}
                      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-muted"
                    >
                      {place.kind === "country" && getCountry(place.countryCode) ? (
                        <span className="mt-0.5 text-base leading-none" aria-hidden>{getCountry(place.countryCode)!.emoji}</span>
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
            {selectedIsWholeCountry && selectedFlag ? (
              <span className="mt-0.5 text-base leading-none" aria-hidden>{selectedFlag}</span>
            ) : (
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 break-words">{selected.name}</span>
          </p>
        ) : null}

        <LocationPreviewMap
          place={selected}
          approximate={approximate}
          seed={approximateSeed}
          onDragged={(latitude, longitude) => void adoptCoordinates(latitude, longitude)}
        />
        {selected ? (
          <p className="text-xs text-muted-foreground">
            {selectedIsWholeCountry ? t("countryHint") : t("dragHint")}
          </p>
        ) : null}

        {/* "Approximate" only means something for a declared point — a country
            is already the coarsest a location gets, and an exact-point caller
            (a recorder's position) must never fuzz its measurement. */}
        {pointOnly ? null : (
        <label
          className={`flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 ${
            selectedIsWholeCountry ? "hidden" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={approximate}
            onChange={(e) => {
              setApproximate(e.target.checked);
              if (selected) setDirty(true);
            }}
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
        )}
      </div>

      {/* One server-side request does the whole save; the modal stays locked
          until it lands so the result — either way — is always seen. */}
      {saving ? (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full origin-start animate-pulse rounded-full bg-[var(--primary)]" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">{t("savingLocation")}</p>
        </div>
      ) : null}
      {saveError ? <p className="mt-3 text-sm text-destructive">{saveError}</p> : null}

      <ModalFooter className="mt-4 flex-row items-center justify-between gap-2">
        {current && (!pointOnly || allowRemove) ? (
          <Button variant="ghost" className="text-muted-foreground" onClick={handleRemove} disabled={saving}>
            {t("remove")}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={handleSave} disabled={!selected || !dirty || saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
          {t("save")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
