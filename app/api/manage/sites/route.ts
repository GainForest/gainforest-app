import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchLocationsByDid, type ManagedLocation } from "@/app/_lib/indexer";
import { resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Please sign in and try again." }, { status: 401 });
  }
  try {
    const [indexedLocations, directLocations] = await Promise.all([
      fetchLocationsByDid(session.did),
      fetchDirectLocations(session.did).catch(() => []),
    ]);
    return Response.json(mergeLocations(indexedLocations, directLocations));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch sites";
    return Response.json({ error: message }, { status: 500 });
  }
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

function directLocationFromRecord(did: string, record: ListedRecord): ManagedLocation | null {
  const value = record.value;
  if (!value) return null;
  const locationType = typeof value.locationType === "string" ? value.locationType : null;
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
      location: locationType && locationType !== "point" && locationType !== "coordinate-decimal"
        ? { kind: "uri", uri: record.uri }
        : null,
    },
  };
}

async function fetchDirectLocations(did: string): Promise<ManagedLocation[]> {
  const host = await resolvePdsHost(did);
  if (!host) return [];
  const params = new URLSearchParams({ repo: did, collection: "app.certified.location", limit: "100" });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = (await response.json()) as ListedRecordsResponse;
  return (data.records ?? [])
    .map((record) => directLocationFromRecord(did, record))
    .filter((location): location is ManagedLocation => Boolean(location));
}

function mergeLocations(indexed: ManagedLocation[], direct: ManagedLocation[]): ManagedLocation[] {
  const merged = new Map<string, ManagedLocation>();
  for (const location of direct) merged.set(location.metadata.uri, location);
  for (const location of indexed) merged.set(location.metadata.uri, location);
  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.metadata.createdAt ? Date.parse(a.metadata.createdAt) : 0;
    const bTime = b.metadata.createdAt ? Date.parse(b.metadata.createdAt) : 0;
    return bTime - aTime;
  });
}
