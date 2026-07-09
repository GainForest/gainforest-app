export const INATURALIST_OBSERVATION_SOURCE = "inaturalist";

export type INaturalistSyncStatus = "pending" | "syncing" | "synced" | "syncedElsewhere" | "error";

export type INaturalistProjectSummary = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  url: string;
  observationCount: number;
};

export type INaturalistPhotoSummary = {
  id: number | null;
  url: string;
  attribution: string | null;
  licenseCode: string | null;
};

export type INaturalistObservationSummary = {
  id: number;
  url: string;
  scientificName: string | null;
  commonName: string | null;
  kingdom: string | null;
  observedOn: string | null;
  recordedBy: string | null;
  latitude: number | null;
  longitude: number | null;
  placeGuess: string | null;
  description: string | null;
  qualityGrade: string | null;
  photos: INaturalistPhotoSummary[];
  syncStatus: INaturalistSyncStatus;
  existingUri: string | null;
};

export type ParsedINaturalistProjectUrl = {
  slug: string;
  normalizedUrl: string;
};

function withHttpsPrefix(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

export function parseINaturalistProjectUrl(input: string): ParsedINaturalistProjectUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate: string;
  if (trimmed.startsWith("/")) {
    candidate = `https://www.inaturalist.org${trimmed}`;
  } else if (/^projects\//i.test(trimmed)) {
    candidate = `https://www.inaturalist.org/${trimmed}`;
  } else if (/^(www\.)?inaturalist\.org(?:\/|$)/i.test(trimmed)) {
    candidate = withHttpsPrefix(trimmed);
  } else if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) {
    candidate = `https://www.inaturalist.org/projects/${trimmed}`;
  } else {
    candidate = withHttpsPrefix(trimmed);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "inaturalist.org") return null;

  const match = parsed.pathname.match(/\/projects\/([^/?#]+)/i);
  const rawSlug = match?.[1];
  if (!rawSlug) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug).trim();
  } catch {
    slug = rawSlug.trim();
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) return null;

  return {
    slug,
    normalizedUrl: `https://www.inaturalist.org/projects/${encodeURIComponent(slug)}`,
  };
}

export function inaturalistOccurrenceUrl(id: number): string {
  return `https://www.inaturalist.org/observations/${id}`;
}

export function inaturalistOccurrenceIdKey(id: number): string {
  return `inaturalist:${id}`;
}
