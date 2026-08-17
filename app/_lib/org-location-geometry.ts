/**
 * Pure geometry + labeling helpers for an organization's declared location.
 *
 * An organization's location is an `app.certified.location` record. When the
 * steward asks for an approximate location, the exact point is never
 * published: the coordinate is offset by up to ~0.1° per axis and the record
 * carries a ~10 km circle around the offset point, with a name coarsened to
 * region/country. This mirrors how Ma Earth publishes approximate sites, so
 * records from either app read the same way.
 *
 * The offset itself lives in `org-location-fuzz.ts` — it is keyed on a
 * server-held secret and so cannot run here.
 */

/** Per-axis offset applied to an approximate location, in degrees (~11 km). */
export const APPROXIMATE_FUZZ_DEGREES = 0.1;
/** Radius of the published circle around the offset point. */
export const APPROXIMATE_CIRCLE_RADIUS_KM = 10;
/** Vertices used to approximate the circle. */
export const APPROXIMATE_CIRCLE_STEPS = 32;

/** `app.certified.location.name` allows at most 100 graphemes. */
export const LOCATION_NAME_MAX_GRAPHEMES = 100;

const EARTH_RADIUS_KM = 6371;

export type GeocodedPlace = {
  /** Human-readable label of the exact place (address, town, park, …). */
  name: string;
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2, upper-case, when the geocoder knows it. */
  countryCode: string | null;
  /** State / region display name, for the coarse approximate label. */
  region: string | null;
  /** Country display name, for the coarse approximate label. */
  country: string | null;
  /** Whether the result is a whole country (renders with a flag). */
  kind: "country" | "place";
};

export type OrgLocationChoice = {
  place: GeocodedPlace;
  /** Publish only an offset ~10 km area and a coarse name. */
  approximate: boolean;
};

/** Clip to the lexicon's grapheme budget without splitting a character. */
export function clipLocationName(name: string): string {
  const trimmed = name.trim();
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const graphemes = [...new Intl.Segmenter().segment(trimmed)];
    if (graphemes.length <= LOCATION_NAME_MAX_GRAPHEMES) return trimmed;
    return graphemes
      .slice(0, LOCATION_NAME_MAX_GRAPHEMES - 1)
      .map((segment) => segment.segment)
      .join("")
      .trimEnd() + "…";
  }
  const points = [...trimmed];
  return points.length <= LOCATION_NAME_MAX_GRAPHEMES
    ? trimmed
    : points.slice(0, LOCATION_NAME_MAX_GRAPHEMES - 1).join("").trimEnd() + "…";
}

/**
 * A geodesic circle polygon around a point, as a GeoJSON Feature. Coordinates
 * are rounded to 6 decimals (~11 cm) to keep the payload small.
 */
export function circlePolygonFeature(
  latitude: number,
  longitude: number,
  radiusKm: number = APPROXIMATE_CIRCLE_RADIUS_KM,
  steps: number = APPROXIMATE_CIRCLE_STEPS,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const latRad = (latitude * Math.PI) / 180;
  const lonRad = (longitude * Math.PI) / 180;
  const angular = radiusKm / EARTH_RADIUS_KM;
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const destLat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const destLon =
      lonRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(destLat),
      );
    ring.push([
      Number((((destLon * 180) / Math.PI + 540) % 360 - 180).toFixed(6)),
      Number(((destLat * 180) / Math.PI).toFixed(6)),
    ]);
  }
  // Close the ring exactly on the first vertex (rounding can drift the last).
  ring[ring.length - 1] = [...ring[0]!] as [number, number];
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/**
 * The coarse label published for an approximate location: "Region, Country",
 * falling back to the country alone. Never the precise place name — that is
 * what the approximation hides. Null when nothing coarse is known; publishing
 * no name beats publishing the name we were asked to hide.
 */
export function coarsePlaceLabel(place: Pick<GeocodedPlace, "region" | "country">): string | null {
  const region = place.region?.trim() || null;
  const country = place.country?.trim() || null;
  if (region && country && region !== country) return `${region}, ${country}`;
  return country ?? region;
}

/** The name that actually gets published on the location record. */
export function publishedLocationName(choice: OrgLocationChoice): string | null {
  if (!choice.approximate) {
    const name = choice.place.name.trim();
    return name ? clipLocationName(name) : null;
  }
  const coarse = coarsePlaceLabel(choice.place);
  return coarse ? clipLocationName(coarse) : null;
}
