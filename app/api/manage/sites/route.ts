import { fetchLocationsByDid, type ManagedLocation } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../_lib/target";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

const INDEXER_TIMEOUT_MS = 8_000;
const DIRECT_PDS_TIMEOUT_MS = 8_000;

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const [indexedLocations, directLocations] = await Promise.all([
    fetchWithTimeout(INDEXER_TIMEOUT_MS, (signal) => fetchLocationsByDid(target.did, signal)),
    fetchWithTimeout(DIRECT_PDS_TIMEOUT_MS, (signal) => fetchDirectLocations(target.did, signal)),
  ]);

  return Response.json(mergeLocations(indexedLocations, directLocations));
}

type ListedRecord = {
  uri: string;
  cid: string;
  value?: Record<string, unknown>;
};

type ListedRecordsResponse = {
  records?: ListedRecord[];
};

function rkeyFromUri(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractBlobRef(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  if (typeof value.$link === "string") return value.$link;
  if (typeof value.ref === "string") return value.ref;
  if (isRecord(value.ref) && typeof value.ref.$link === "string") return value.ref.$link;
  return null;
}

async function directLocationFromRecord(did: string, record: ListedRecord, signal?: AbortSignal): Promise<ManagedLocation | null> {
  const value = record.value;
  if (!value) return null;
  const locationType = typeof value.locationType === "string" ? value.locationType : null;
  const rawLocation = isRecord(value.location) ? value.location : null;
  const locationUrl = typeof rawLocation?.uri === "string"
    ? rawLocation.uri
    : await resolveBlobUrl(did, extractBlobRef(rawLocation?.blob), signal).catch(() => null);
  return {
    metadata: {
      did,
      uri: record.uri,
      rkey: rkeyFromUri(record.uri),
      cid: record.cid,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    },
    record: {
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : null,
      description: typeof value.description === "string" && value.description.trim() ? value.description.trim() : null,
      locationType,
      location: locationUrl
        ? { kind: "uri", uri: locationUrl }
        : null,
    },
    rawRecord: value,
  };
}

async function fetchDirectLocations(did: string, signal?: AbortSignal): Promise<ManagedLocation[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return [];
  const params = new URLSearchParams({ repo: did, collection: "app.certified.location", limit: "100" });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return [];
  const data = (await response.json()) as ListedRecordsResponse;
  const locations = await Promise.all(
    (data.records ?? []).map((record) => directLocationFromRecord(did, record, signal)),
  );
  return locations.filter((location): location is ManagedLocation => Boolean(location));
}

async function fetchWithTimeout<T>(ms: number, load: (signal: AbortSignal) => Promise<T[]>): Promise<T[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await load(controller.signal);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function mergeLocations(indexed: ManagedLocation[], direct: ManagedLocation[]): ManagedLocation[] {
  const merged = new Map<string, ManagedLocation>();
  for (const location of direct) merged.set(location.metadata.uri, location);
  for (const location of indexed) {
    const directLocation = merged.get(location.metadata.uri);
    merged.set(location.metadata.uri, {
      ...location,
      rawRecord: location.rawRecord ?? directLocation?.rawRecord ?? null,
      record: {
        ...location.record,
        location: location.record.location ?? directLocation?.record.location ?? null,
      },
    });
  }
  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.metadata.createdAt ? Date.parse(a.metadata.createdAt) : 0;
    const bTime = b.metadata.createdAt ? Date.parse(b.metadata.createdAt) : 0;
    return bTime - aTime;
  });
}
