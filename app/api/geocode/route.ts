import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeocodeResult = {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
};

type NominatimResult = {
  place_id?: number | string;
  osm_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number | string;
    name?: string;
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
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

function mapNominatimResult(raw: NominatimResult): GeocodeResult | null {
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

async function searchNominatim(query: string, locale: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: String(SEARCH_LIMIT),
    q: query,
    "accept-language": locale,
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Referer: "https://www.gainforest.app/",
      "User-Agent": USER_AGENT,
    },
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

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locale = cleanLocale(request.nextUrl.searchParams.get("locale"));
  if (query.length < MIN_QUERY_LENGTH) return NextResponse.json({ results: [] });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const nominatimResults = await searchNominatim(query, locale, controller.signal).catch(() => []);
    const results = nominatimResults.length > 0
      ? nominatimResults
      : await searchPhoton(query, locale, controller.signal).catch(() => []);
    return NextResponse.json({ results });
  } finally {
    clearTimeout(timeout);
  }
}
