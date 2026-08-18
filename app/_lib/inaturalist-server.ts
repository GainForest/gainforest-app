import {
  inaturalistOccurrenceUrl,
  parseINaturalistProjectUrl,
  type INaturalistObservationSummary,
  type INaturalistPhotoSummary,
  type INaturalistProjectSummary,
} from "./inaturalist-shared";

const INATURALIST_API_BASE = "https://api.inaturalist.org/v1";
const INATURALIST_PAGE_SIZE = 200;
const INATURALIST_MAX_OBSERVATIONS = 5_000;

type INaturalistProjectPayload = {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  description?: unknown;
};

type INaturalistProjectApiResponse = {
  total_results?: unknown;
  page?: unknown;
  per_page?: unknown;
  results?: INaturalistProjectPayload[];
};

type INaturalistObservationApiResponse = {
  total_results?: unknown;
  page?: unknown;
  per_page?: unknown;
  results?: unknown[];
};

type ExistingINaturalistRecord = {
  uri: string;
  projectRef: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function preferredPhotoUrl(photo: Record<string, unknown>): string | null {
  const direct = stringValue(photo.medium_url) ?? stringValue(photo.large_url);
  if (direct) return direct;
  const raw = stringValue(photo.url);
  if (!raw) return null;
  return raw.replace(/\/square(\.[a-z0-9]+)(\?.*)?$/i, "/medium$1$2");
}

function photoSummary(value: unknown): INaturalistPhotoSummary | null {
  if (!isRecord(value)) return null;
  const url = preferredPhotoUrl(value);
  if (!url) return null;
  return {
    id: numberValue(value.id),
    url,
    attribution: stringValue(value.attribution),
    licenseCode: stringValue(value.license_code),
  };
}

function observationCoordinates(value: Record<string, unknown>): { latitude: number | null; longitude: number | null } {
  const geojson = isRecord(value.geojson) ? value.geojson : null;
  const coordinates = Array.isArray(geojson?.coordinates) ? geojson.coordinates : null;
  const lon = coordinates ? numberValue(coordinates[0]) : null;
  const lat = coordinates ? numberValue(coordinates[1]) : null;
  if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };

  const location = stringValue(value.location);
  if (!location) return { latitude: null, longitude: null };
  const [rawLat, rawLon] = location.split(",");
  const fallbackLat = Number(rawLat);
  const fallbackLon = Number(rawLon);
  return {
    latitude: Number.isFinite(fallbackLat) ? fallbackLat : null,
    longitude: Number.isFinite(fallbackLon) ? fallbackLon : null,
  };
}

function observationSummary(value: unknown, existing: ExistingINaturalistRecord | null, projectRef: string | null): INaturalistObservationSummary | null {
  if (!isRecord(value)) return null;
  const id = numberValue(value.id);
  if (id === null) return null;

  const taxon = isRecord(value.taxon) ? value.taxon : null;
  const user = isRecord(value.user) ? value.user : null;
  const coordinates = observationCoordinates(value);
  const photos = Array.isArray(value.photos) ? value.photos.map(photoSummary).filter((photo): photo is INaturalistPhotoSummary => Boolean(photo)) : [];
  const existingProjectRef = existing?.projectRef ?? null;

  return {
    id,
    url: stringValue(value.uri) ?? inaturalistOccurrenceUrl(id),
    scientificName: stringValue(taxon?.name) ?? stringValue(value.species_guess),
    commonName: stringValue(taxon?.preferred_common_name) ?? (taxon ? stringValue(taxon.english_common_name) : null),
    kingdom: taxon ? stringValue(taxon.iconic_taxon_name) : null,
    observedOn: stringValue(value.time_observed_at) ?? stringValue(value.observed_on) ?? stringValue(value.observed_on_string),
    recordedBy: user ? (stringValue(user.name) ?? stringValue(user.login)) : null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    placeGuess: stringValue(value.place_guess),
    description: stringValue(value.description),
    qualityGrade: stringValue(value.quality_grade),
    photos,
    syncStatus: existing ? (projectRef && existingProjectRef !== projectRef ? "syncedElsewhere" : "synced") : "pending",
    existingUri: existing?.uri ?? null,
  };
}

async function inaturalistGet<T>(path: string, params: URLSearchParams, accessToken?: string | null): Promise<T> {
  const response = await fetch(`${INATURALIST_API_BASE}${path}?${params.toString()}`, {
    headers: {
      accept: "application/json",
      "user-agent": "GainForest iNaturalist project sync",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? payload?.error ?? "Could not reach iNaturalist.");
  }
  return payload;
}

function projectSummary(project: INaturalistProjectPayload | undefined, fallbackSlug?: string): INaturalistProjectSummary | null {
  const id = numberValue(project?.id);
  const title = stringValue(project?.title);
  const slug = stringValue(project?.slug) ?? fallbackSlug;
  if (id === null || !title || !slug) return null;
  return {
    id,
    title,
    slug,
    description: stringValue(project?.description),
    url: `https://www.inaturalist.org/projects/${encodeURIComponent(slug)}`,
    observationCount: 0,
  };
}

export async function fetchINaturalistProject(input: string): Promise<INaturalistProjectSummary> {
  const parsed = parseINaturalistProjectUrl(input);
  if (!parsed) throw new Error("Enter an iNaturalist project page link.");
  const params = new URLSearchParams();
  const data = await inaturalistGet<INaturalistProjectApiResponse>(`/projects/${encodeURIComponent(parsed.slug)}`, params);
  const project = projectSummary(data.results?.[0], parsed.slug);
  if (!project) throw new Error("We could not find that iNaturalist project.");
  return project;
}

export async function fetchINaturalistProjectById(id: number): Promise<INaturalistProjectSummary> {
  const params = new URLSearchParams();
  const data = await inaturalistGet<INaturalistProjectApiResponse>(`/projects/${encodeURIComponent(String(id))}`, params);
  const project = projectSummary(data.results?.[0]);
  if (!project) throw new Error("We could not find that iNaturalist project.");
  return project;
}

export async function fetchINaturalistUserProjects(userId: number): Promise<INaturalistProjectSummary[]> {
  const projects: INaturalistProjectSummary[] = [];
  const seen = new Set<number>();
  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({ per_page: String(perPage), page: String(page), order: "asc", order_by: "title" });
    const data = await inaturalistGet<INaturalistProjectApiResponse>(`/users/${encodeURIComponent(String(userId))}/projects`, params);
    const rows = data.results ?? [];
    for (const row of rows) {
      const project = projectSummary(row);
      if (!project || seen.has(project.id)) continue;
      seen.add(project.id);
      projects.push(project);
    }
    const total = numberValue(data.total_results);
    if (rows.length === 0 || rows.length < perPage || (total !== null && projects.length >= total)) break;
  }
  return projects.sort((left, right) => left.title.localeCompare(right.title));
}

export async function fetchINaturalistProjectObservations(options: {
  project: INaturalistProjectSummary;
  existingByObservationId?: Map<number, ExistingINaturalistRecord>;
  projectRef?: string | null;
  userId?: number | null;
  accessToken?: string | null;
}): Promise<{ observations: INaturalistObservationSummary[]; totalResults: number; truncated: boolean }> {
  const observations: INaturalistObservationSummary[] = [];
  let totalResults = 0;
  let page = 1;

  while (observations.length < INATURALIST_MAX_OBSERVATIONS) {
    const params = new URLSearchParams({
      project_id: String(options.project.id),
      per_page: String(INATURALIST_PAGE_SIZE),
      page: String(page),
      order: "desc",
      order_by: "observed_on",
    });
    if (options.userId) params.set("user_id", String(options.userId));
    const data = await inaturalistGet<INaturalistObservationApiResponse>("/observations", params, options.accessToken);
    totalResults = typeof data.total_results === "number" ? data.total_results : totalResults;
    const rows = Array.isArray(data.results) ? data.results : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (observations.length >= INATURALIST_MAX_OBSERVATIONS) break;
      const id = isRecord(row) ? numberValue(row.id) : null;
      const summary = observationSummary(
        row,
        id === null ? null : options.existingByObservationId?.get(id) ?? null,
        options.projectRef ?? null,
      );
      if (summary) observations.push(summary);
    }

    if (totalResults > 0 && observations.length >= totalResults) break;
    page += 1;
  }

  return { observations, totalResults, truncated: totalResults > observations.length };
}
