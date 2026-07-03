"use client";

/**
 * PartnersGlobe — the Partners section's interactive globe, a trimmed
 * port of `bumicerts-clean-rewrite/app/globe/_components/GlobeMap.tsx`
 * (the merged app's /globe view): MapLibre GL globe projection with
 * satellite imagery, space/atmosphere treatment, idle spin, and one
 * circular logo badge per organization.
 *
 * What was deliberately dropped from the source component: project-site
 * boundaries, the highlighted-site outline, ESA WorldCover landcover,
 * the TiTiler data layers, and camera `fitBounds` flights — the landing
 * only shows the global roster. What was added: `scrollZoom` is
 * disabled so the page keeps scrolling normally over the canvas (same
 * rule as the hero globe); zoom stays available via the nav control.
 *
 * Markers: every organization pin shows that org's own logo (resolved
 * through `/api/partner-cards` → Certified profile cards, then cropped
 * into a thin-ring circle). Orgs without a resolvable avatar fall back
 * to a GainForest mark, or the Ma Earth mark for badge holders.
 */

import maplibregl, {
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globe.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_FEATURE_COLLECTION,
  GLOBE_INITIAL_CENTER,
  GLOBE_INITIAL_ZOOM,
  MA_EARTH_LOGO_URL,
  countryFlag,
  countryName,
  globeMapStyle,
} from "./config";
import {
  DEFAULT_BADGE_ID,
  MA_EARTH_BADGE_ID,
  buildCircleBadge,
  buildDefaultBadge,
  loadHtmlImage,
  orgLogoImageId,
} from "./markers";
import { resolveDidAvatar } from "./did-avatars";
import type { PartnerOrg } from "../../_lib/partner-orgs";

const MARKER_SOURCE = "projectMarkerSource";
const MARKER_LAYER = "projectMarkerLayer";

type PartnersGlobeProps = {
  organizations: PartnerOrg[];
  onSelectOrganization?: (did: string) => void;
  /** Idle rotation (port of Green Globe's spinGlobe). */
  spin?: boolean;
  className?: string;
};

/** Marker hover card: org name + country, built via DOM (XSS-safe). */
function popupContent(name: string, country: string | null): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("p");
  title.className = "globe-popup-name";
  title.textContent = name;
  root.appendChild(title);
  if (country) {
    const sub = document.createElement("p");
    sub.className = "globe-popup-country";
    sub.textContent = `${countryFlag(country)} ${countryName(country)}`.trim();
    root.appendChild(sub);
  }
  return root;
}

// ── Idle globe rotation (port of Green Globe's spinGlobe) ──────────────────

function spinGlobe(map: maplibregl.Map, enabled: boolean) {
  const secondsPerRevolution = 120;
  const maxSpinZoom = 5;
  const slowSpinZoom = 3;
  const zoom = map.getZoom();
  if (!enabled || zoom >= maxSpinZoom) return;
  let distancePerSecond = 360 / secondsPerRevolution;
  if (zoom > slowSpinZoom) {
    distancePerSecond *= (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom);
  }
  const center = map.getCenter();
  center.lng -= distancePerSecond;
  map.easeTo({ center, duration: 1000, easing: (n) => n });
}

export function PartnersGlobe({
  organizations,
  onSelectOrganization,
  spin = true,
  className,
}: PartnersGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const spinRef = useRef(spin);
  const selectRef = useRef(onSelectOrganization);
  const organizationsRef = useRef(organizations);
  // did → whether that org's own logo badge has been added to the map yet
  // ("pending" while the avatar is being fetched/cropped, "none" once it's
  // confirmed the org has no avatar so the fallback badge is used instead).
  const logoStatusRef = useRef(new Map<string, "pending" | "loaded" | "none">());
  selectRef.current = onSelectOrganization;
  organizationsRef.current = organizations;

  // Rebuild the marker source from the latest roster + whatever logo badges
  // have loaded so far. Called on roster changes and again each time an
  // individual org's logo finishes loading (so it swaps in incrementally).
  const setMarkerData = useCallback(() => {
    const map = mapRef.current;
    const source = map?.getSource(MARKER_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: organizationsRef.current
        .filter((org) => typeof org.lat === "number" && typeof org.lon === "number")
        .map((org) => {
          const hasLogo = logoStatusRef.current.get(org.did) === "loaded";
          const iconId = hasLogo
            ? orgLogoImageId(org.did)
            : org.maEarth
              ? MA_EARTH_BADGE_ID
              : DEFAULT_BADGE_ID;
          return {
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [org.lon as number, org.lat as number],
            },
            properties: {
              did: org.did,
              name: org.name,
              country: org.country,
              maEarth: org.maEarth === true,
              iconId,
            },
          };
        }),
    });
  }, []);

  // Fetch + crop one org's avatar into the shared badge image, then refresh
  // the marker source so it swaps in from the fallback badge.
  const ensureOrgLogo = useCallback(
    async (map: maplibregl.Map, did: string) => {
      if (logoStatusRef.current.has(did)) return;
      logoStatusRef.current.set(did, "pending");
      try {
        const avatar = await resolveDidAvatar(did);
        if (!avatar) {
          logoStatusRef.current.set(did, "none");
          return;
        }
        const img = await loadHtmlImage(avatar);
        const badge = buildCircleBadge(img, "cover");
        const id = orgLogoImageId(did);
        if (!map.hasImage(id)) {
          map.addImage(id, badge.image, { pixelRatio: badge.pixelRatio });
        }
        logoStatusRef.current.set(did, "loaded");
        setMarkerData();
      } catch {
        logoStatusRef.current.set(did, "none");
      }
    },
    [setMarkerData],
  );

  // One-time map initialisation.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style: globeMapStyle(),
      center: GLOBE_INITIAL_CENTER,
      zoom: GLOBE_INITIAL_ZOOM,
      // Both controls live bottom-LEFT here (the source app keeps them
      // bottom-right): the Partners spotlight card occupies the panel's
      // bottom-right corner and would cover them.
      attributionControl: false,
    });
    mapRef.current = map;

    // Landing rule (same as the hero globe): the page must keep scrolling
    // normally over the canvas. Zoom stays available via the control pills.
    map.scrollZoom.disable();
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    // Idle rotation: keep spinning between eased moves until the user grabs
    // the globe (mirrors Green Globe's behaviour).
    let interacted = false;
    const continueSpin = () => spinGlobe(map, spinRef.current && !interacted);
    const stopSpin = () => {
      interacted = true;
    };
    map.on("moveend", continueSpin);
    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "globe-popup",
      offset: [0, -20],
    });

    map.on("load", () => {
      // Organization markers: each org's own logo, cropped into a small
      // circular badge. Orgs without a resolvable avatar fall back to a
      // GainForest mark (or a Ma Earth mark for badge holders), drawn
      // client-side so no extra pin assets are needed.
      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });
      Promise.all([
        Promise.resolve(buildDefaultBadge()),
        loadHtmlImage(MA_EARTH_LOGO_URL).then((img) => buildCircleBadge(img, "cover")),
      ])
        .then(([defaultBadge, maEarthBadge]) => {
          if (!map.hasImage(DEFAULT_BADGE_ID)) {
            map.addImage(DEFAULT_BADGE_ID, defaultBadge.image, {
              pixelRatio: defaultBadge.pixelRatio,
            });
          }
          if (!map.hasImage(MA_EARTH_BADGE_ID)) {
            map.addImage(MA_EARTH_BADGE_ID, maEarthBadge.image, {
              pixelRatio: maEarthBadge.pixelRatio,
            });
          }
          if (!map.getLayer(MARKER_LAYER)) {
            map.addLayer({
              id: MARKER_LAYER,
              type: "symbol",
              source: MARKER_SOURCE,
              layout: {
                "icon-image": ["get", "iconId"],
                "icon-size": 1,
                "icon-allow-overlap": true,
                "icon-anchor": "center",
              },
            });
          }
          // Any orgs whose source data was set before the layer/fallback
          // badges existed need their iconId re-resolved now that they do.
          setMarkerData();
        })
        .catch((error) => console.warn("[partners globe] marker badges failed", error));

      const handleMarkerMove = (event: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const coordinates = feature.geometry.coordinates.slice() as [number, number];
        while (Math.abs(event.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += event.lngLat.lng > coordinates[0] ? 360 : -360;
        }
        const name = String(feature.properties?.name ?? "");
        const country = feature.properties?.country
          ? String(feature.properties.country)
          : null;
        popup.setLngLat(coordinates).setDOMContent(popupContent(name, country)).addTo(map);
      };
      const handleMarkerLeave = () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      };
      const handleMarkerClick = (event: MapLayerMouseEvent) => {
        const did = event.features?.[0]?.properties?.did;
        if (typeof did === "string" && did) selectRef.current?.(did);
      };
      map.on("mousemove", MARKER_LAYER, handleMarkerMove);
      map.on("mouseleave", MARKER_LAYER, handleMarkerLeave);
      map.on("click", MARKER_LAYER, handleMarkerClick);

      setMapLoaded(true);
      continueSpin();
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      logoStatusRef.current.clear();
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the spin flag fresh and nudge the rotation when (re-)enabled.
  useEffect(() => {
    spinRef.current = spin;
    const map = mapRef.current;
    if (spin && map && mapLoaded) spinGlobe(map, true);
  }, [spin, mapLoaded]);

  // Organization markers: refresh the source, then lazily fetch + crop each
  // org's own logo into a badge (re-refreshing the source as each resolves).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    setMarkerData();
    for (const org of organizations) {
      if (typeof org.lat === "number" && typeof org.lon === "number") {
        void ensureOrgLogo(map, org.did);
      }
    }
  }, [organizations, mapLoaded, setMarkerData, ensureOrgLogo]);

  return (
    <div
      ref={containerRef}
      data-testid="partners-globe"
      className={
        "h-full w-full bg-[#0b0b19] transition-opacity duration-700 " +
        (mapLoaded ? "opacity-100" : "opacity-0") +
        (className ? ` ${className}` : "")
      }
    />
  );
}
