"use client";

import { fetchDefaultSiteByDid, fetchLocationsByDid } from "@/app/_lib/indexer";
import { resolveCertifiedLocationCoords } from "@/app/_lib/coords";

export type PickedLocation = { lat: number; lng: number };

/** Round to ~1cm precision; tighter than this is noise for a hand-placed pin. */
export function roundCoord(value: number): number {
  return Number(value.toFixed(7));
}

export function isValidLocation(value: PickedLocation | null | undefined): value is PickedLocation {
  return Boolean(
    value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      value.lng >= -180 &&
      value.lng <= 180,
  );
}

/**
 * Best-effort starting point for the location picker: the organization's default
 * site (app.gainforest.organization.defaultSite), falling back to any site the
 * owner has. Everything resolves through the CORS-open indexer + PDS, so it runs
 * in the browser without an auth round-trip. Returns null when nothing resolves.
 */
export async function fetchDefaultObservationCenter(
  did: string,
  signal?: AbortSignal,
): Promise<PickedLocation | null> {
  const defaultSiteUri = await fetchDefaultSiteByDid(did, signal).catch(() => null);
  if (defaultSiteUri) {
    const coords = await resolveCertifiedLocationCoords(defaultSiteUri, signal).catch(() => null);
    if (coords) return { lat: coords.lat, lng: coords.lon };
  }

  const locations = await fetchLocationsByDid(did, signal).catch(() => []);
  for (const location of locations) {
    const data = location.record.location;
    if (data?.kind === "point") return { lat: data.lat, lng: data.lon };
    if (location.metadata.uri) {
      const coords = await resolveCertifiedLocationCoords(location.metadata.uri, signal).catch(() => null);
      if (coords) return { lat: coords.lat, lng: coords.lon };
    }
  }

  return null;
}
