import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Place search + reverse geocoding (OpenStreetMap: Nominatim first, Photon
 * fallback), shared by the observations location picker and the organization
 * location editor.
 *
 *   GET /api/geocode?q=<text>[&locale=..]   → { results: GeocodeResult[] }
 *   GET /api/geocode?lat=..&lon=..          → { results: [GeocodeResult] | [] }
 */

export type GeocodeResult = {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, upper-case, when the geocoder knows it. */
  countryCode: string | null;
  /** State / region display name, for coarse (approximate) labels. */
  region: string | null;
  /** Country display name, for coarse (approximate) labels. */
  country: string | null;
  /** Whether the result is a whole country. */
  kind: "country" | "place";
};

type NominatimAddress = {
  state?: string;
  county?: string;
  country?: string;
  country_code?: string;
};

type NominatimResult = {
  place_id?: number | string;
  osm_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  addresstype?: string;
  address?: NominatimAddress;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number | string;
    osm_value?: string;
    name?: string;
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
};

type PhotonResponse = { features?: PhotonFeature[] };

const SEARCH_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;
const USER_AGENT = "GainForest/1.0 (https://www.gainforest.app)";

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function cleanLocale(locale: string | null): string {
  const value = (locale ?? "en").trim();
  return /^[a-z]{2}(?:-[A-Z]{2})?$/i.test(value) ? value : "en";
}

function trimmed(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function mapNominatimResult(raw: NominatimResult): GeocodeResult | null {
  const lat = Number.parseFloat(raw.lat ?? "");
  const lng = Number.parseFloat(raw.lon ?? "");
  const displayName = raw.display_name?.trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !displayName) return null;

  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const name = raw.name?.trim() || parts[0] || displayName;
  const detail = parts.slice(name === parts[0] ? 1 : 0).join(", ");
  const address = raw.address ?? {};

  return {
    id: String(raw.place_id ?? raw.osm_id ?? `${lat},${lng},${displayName}`),
    name,
    detail,
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    countryCode: trimmed(address.country_code)?.toUpperCase() ?? null,
    region: trimmed(address.state) ?? trimmed(address.county),
    country: trimmed(address.country),
    kind: raw.addresstype === "country" ? "country" : "place",
  };
}

function mapPhotonFeature(feature: PhotonFeature): GeocodeResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) return null;
  const [lng, lat] = coordinates;
  const props = feature.properties ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = props.name?.trim() || props.street?.trim() || props.city?.trim() || props.country?.trim();
  if (!name) return null;

  const detail = [props.city, props.county, props.state, props.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part !== name))
    .join(", ");

  return {
    id: String(props.osm_id ?? `${lat},${lng},${name}`),
    name,
    detail,
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    countryCode: trimmed(props.countrycode)?.toUpperCase() ?? null,
    region: trimmed(props.state) ?? trimmed(props.county),
    country: trimmed(props.country),
    kind: props.osm_value === "country" ? "country" : "place",
  };
}

function dedupeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const deduped: GeocodeResult[] = [];
  for (const result of results) {
    const key = `${result.name}|${result.detail}|${result.lat.toFixed(4)}|${result.lng.toFixed(4)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= SEARCH_LIMIT) break;
  }
  return deduped;
}

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  Referer: "https://www.gainforest.app/",
  "User-Agent": USER_AGENT,
};

async function searchNominatim(query: string, locale: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: String(SEARCH_LIMIT),
    q: query,
    addressdetails: "1",
    "accept-language": locale,
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: NOMINATIM_HEADERS,
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nominatim search failed: ${response.status}`);
  const data: unknown = await response.json();
  return Array.isArray(data)
    ? dedupeResults(data.map((item) => mapNominatimResult(item as NominatimResult)).filter((item): item is GeocodeResult => Boolean(item)))
    : [];
}

async function searchPhoton(query: string, locale: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  const lang = locale.split("-")[0]?.toLowerCase() || "en";
  const params = new URLSearchParams({ q: query, limit: String(SEARCH_LIMIT), lang });
  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Photon search failed: ${response.status}`);
  const data = (await response.json()) as PhotonResponse;
  return dedupeResults((data.features ?? []).map(mapPhotonFeature).filter((item): item is GeocodeResult => Boolean(item)));
}

async function reverseNominatim(lat: number, lon: number, locale: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    addressdetails: "1",
    "accept-language": locale,
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: NOMINATIM_HEADERS,
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nominatim reverse failed: ${response.status}`);
  const data = (await response.json()) as NominatimResult | { error?: unknown };
  if ("error" in data && data.error) return [];
  const result = mapNominatimResult(data as NominatimResult);
  return result ? [result] : [];
}

async function reversePhoton(lat: number, lon: number, locale: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  const lang = locale.split("-")[0]?.toLowerCase() || "en";
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang });
  const response = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Photon reverse failed: ${response.status}`);
  const data = (await response.json()) as PhotonResponse;
  const result = (data.features ?? []).map(mapPhotonFeature).find((item): item is GeocodeResult => Boolean(item));
  return result ? [result] : [];
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locale = cleanLocale(request.nextUrl.searchParams.get("locale"));
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

  if (query.length < MIN_QUERY_LENGTH && !hasPoint) return NextResponse.json({ results: [] });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    if (query.length >= MIN_QUERY_LENGTH) {
      const nominatimResults = await searchNominatim(query, locale, controller.signal).catch(() => []);
      const results = nominatimResults.length > 0
        ? nominatimResults
        : await searchPhoton(query, locale, controller.signal).catch(() => []);
      return NextResponse.json({ results });
    }
    const reversed = await reverseNominatim(lat, lon, locale, controller.signal).catch(() => []);
    const results = reversed.length > 0
      ? reversed
      : await reversePhoton(lat, lon, locale, controller.signal).catch(() => []);
    return NextResponse.json({ results });
  } finally {
    clearTimeout(timeout);
  }
}
