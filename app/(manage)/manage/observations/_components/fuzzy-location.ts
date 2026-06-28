"use client";

import { circleGeoJson, type CircleFeature } from "@/app/_lib/geo-circle";
import type { PickedLocation } from "./default-location";

/**
 * Privacy-preserving "fuzzy" location for observations.
 *
 * Some observers photograph wildlife in their own garden and do not want the
 * published record to reveal exactly where they live. Instead of writing the
 * precise pin, we publish an *approximate circle* using only standard Darwin
 * Core terms:
 *
 *   1. The true point is offset by a random bearing + distance to a new
 *      **centroid**, so the centre of the circle is deliberately NOT the
 *      observer's real location (a viewer cannot assume "centre == home").
 *   2. That centroid is published as `decimalLatitude` / `decimalLongitude`,
 *      and the circle radius as `coordinateUncertaintyInMeters`. The true point
 *      always falls *inside* the circle, so the record stays regionally
 *      accurate while the exact spot is hidden.
 *   3. `dataGeneralizations` + `informationWithheld` flag the generalisation so
 *      downstream consumers handle it correctly.
 *
 * Nothing custom is persisted — the obscured circle is reconstructed on the map
 * from point + radius via `@/app/_lib/geo-circle`.
 */

export type FuzzyAreaId = "tight" | "balanced" | "wide";

export type FuzzyAreaOption = {
  id: FuzzyAreaId;
  radiusMeters: number;
};

/**
 * Approximate-area presets. ~500 m ("balanced") is the recommended default: a
 * 1 km-wide circle hides the exact house/street while keeping the observation
 * meaningful at neighbourhood scale. Tighter than ~300 m starts to give the
 * real spot away; wider than ~1 km makes the record too vague to be useful.
 */
export const FUZZY_AREA_OPTIONS: readonly FuzzyAreaOption[] = [
  { id: "tight", radiusMeters: 300 },
  { id: "balanced", radiusMeters: 500 },
  { id: "wide", radiusMeters: 1000 },
] as const;

export const DEFAULT_FUZZY_AREA: FuzzyAreaId = "balanced";

export function radiusForArea(id: FuzzyAreaId): number {
  return FUZZY_AREA_OPTIONS.find((option) => option.id === id)?.radiusMeters ?? 500;
}

const METERS_PER_DEGREE_LAT = 111_320;
// The centroid is offset from the true point by a random fraction of the radius.
// A floor (> 0) guarantees the centroid is never the real location; the ceiling
// keeps the true point comfortably inside the published circle.
const MIN_OFFSET_FRACTION = 0.35;
const MAX_OFFSET_FRACTION = 0.7;

export type FuzzyLocation = {
  /** Random, offset centre of the circle — published as the coordinate. */
  centroid: PickedLocation;
  radiusMeters: number;
  /** GeoJSON polygon approximating the circle around `centroid` (for display). */
  circle: CircleFeature;
};

function metersToLatDegrees(meters: number): number {
  return meters / METERS_PER_DEGREE_LAT;
}

function metersToLngDegrees(meters: number, atLat: number): number {
  const scale = Math.cos((atLat * Math.PI) / 180);
  return meters / (METERS_PER_DEGREE_LAT * Math.max(Math.abs(scale), 1e-6));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Build a fuzzy circle for `point`. `random` is injectable so tests can pin the
 * geometry; production passes the default `Math.random`.
 */
export function fuzzLocation(
  point: PickedLocation,
  radiusMeters: number,
  random: () => number = Math.random,
): FuzzyLocation {
  const radius = Math.max(1, radiusMeters);

  // Offset the centroid away from the true point.
  const offsetBearing = random() * 2 * Math.PI;
  const offsetDistance =
    radius * (MIN_OFFSET_FRACTION + random() * (MAX_OFFSET_FRACTION - MIN_OFFSET_FRACTION));
  const offsetNorth = offsetDistance * Math.cos(offsetBearing);
  const offsetEast = offsetDistance * Math.sin(offsetBearing);
  const centerLat = round(point.lat + metersToLatDegrees(offsetNorth), 6);
  const centerLng = round(point.lng + metersToLngDegrees(offsetEast, point.lat), 6);

  return {
    centroid: { lat: centerLat, lng: centerLng },
    radiusMeters: Math.round(radius),
    circle: circleGeoJson(centerLat, centerLng, radius),
  };
}

/** Darwin Core location fields ready to spread onto an occurrence record. */
export type ObservationLocationFields = {
  decimalLatitude: string;
  decimalLongitude: string;
  coordinateUncertaintyInMeters?: number;
  dataGeneralizations?: string;
  informationWithheld?: string;
};

/**
 * Translate a picked location into the occurrence's Darwin Core location fields.
 *
 * When `obscure` is true the precise pin is replaced by a randomised circle: the
 * offset centroid is published as the coordinate and the radius as
 * `coordinateUncertaintyInMeters`, with the standard DwC privacy annotations
 * (`dataGeneralizations`, `informationWithheld`) marking the record as
 * generalised. Otherwise the exact coordinate is returned. No non-standard
 * fields are written — the map derives the circle from point + radius.
 */
export function buildObservationLocationFields(
  location: PickedLocation,
  options: {
    obscure?: boolean;
    radiusMeters?: number;
    random?: () => number;
  } = {},
): ObservationLocationFields {
  if (!options.obscure) {
    return {
      decimalLatitude: String(location.lat),
      decimalLongitude: String(location.lng),
    };
  }

  const fuzzed = fuzzLocation(location, options.radiusMeters ?? radiusForArea(DEFAULT_FUZZY_AREA), options.random);
  return {
    decimalLatitude: String(fuzzed.centroid.lat),
    decimalLongitude: String(fuzzed.centroid.lng),
    coordinateUncertaintyInMeters: fuzzed.radiusMeters,
    dataGeneralizations: `Coordinates generalised to protect the observer's privacy: randomised within an approximately ${fuzzed.radiusMeters} m radius circle around the true location.`,
    informationWithheld: "Precise coordinates withheld to protect the observer's privacy.",
  };
}
