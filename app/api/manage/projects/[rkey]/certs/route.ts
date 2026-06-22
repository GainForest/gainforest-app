import { fetchBumicertsByDid, fetchProjectsByDid, type BumicertRecord, type ProjectRecord } from "@/app/_lib/indexer";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import { isResponse, resolveManageApiTarget } from "../../../_lib/target";

export const runtime = "nodejs";

const PROJECT_COLLECTION = "org.hypercerts.collection";
const BUMICERT_COLLECTION = "org.hypercerts.claim.activity";

type ManagedProject = ProjectRecord & {
  rawRecord: Record<string, unknown> | null;
};

type ManagedBumicert = BumicertRecord & {
  linked: boolean;
};

type ListedRecord = {
  uri: string;
  cid: string;
  value?: Record<string, unknown>;
};

type GetRecordResponse = {
  uri: string;
  cid: string;
  value?: Record<string, unknown>;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ rkey: string }> },
) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const { rkey: rawRkey } = await context.params;
  const rkey = decodeURIComponent(rawRkey ?? "").trim();
  if (!rkey) return Response.json({ error: "Missing project." }, { status: 400 });

  try {
    const [indexedProjects, directProject, indexedBumicerts] = await Promise.all([
      fetchProjectsByDid(target.did, 500).then((page) => page.records).catch(() => []),
      fetchDirectProject(target.did, rkey).catch(() => null),
      fetchBumicertsByDid(target.did, 500).then((page) => page.records).catch(() => []),
    ]);
    const indexedProject = indexedProjects.find((project) => project.rkey === rkey) ?? null;
    const project = mergeProject(indexedProject, directProject);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

    const linkedUris = new Set(project.bumicertUris);
    const missingLinkedUris = project.bumicertUris.filter((uri) => !indexedBumicerts.some((cert) => cert.atUri === uri));
    const directLinkedBumicerts = await Promise.all(missingLinkedUris.map((uri) => fetchDirectBumicertFromUri(uri).catch(() => null)));
    const certs = mergeBumicerts(indexedBumicerts, directLinkedBumicerts.filter((cert): cert is BumicertRecord => Boolean(cert)), linkedUris);

    return Response.json({ project, certs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch project Certs.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

function didFromUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\//);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractBlobRef(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  if (typeof value.$link === "string") return value.$link;
  if (typeof value.ref === "string") return value.ref;
  if (isRecord(value.ref) && typeof value.ref.$link === "string") return value.ref.$link;
  return null;
}

function itemRefFromValue(value: unknown): { uri: string; cid: string | null } | null {
  if (!isRecord(value)) return null;
  const itemIdentifier = isRecord(value.itemIdentifier) ? value.itemIdentifier : value;
  const uri = extractString(itemIdentifier.uri);
  if (!uri) return null;
  return { uri, cid: extractString(itemIdentifier.cid) };
}

function collectionImageUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return extractString(value.uri);
}

async function collectionImageUrl(did: string, value: unknown): Promise<{ url: string | null; ref: string | null }> {
  if (!isRecord(value)) return { url: null, ref: null };
  const uri = collectionImageUri(value);
  if (uri) return { url: uri, ref: null };
  const ref = extractBlobRef(value.image) ?? extractBlobRef(value.blob) ?? extractBlobRef(value.ref);
  return {
    url: ref ? await resolveBlobUrl(did, ref, undefined).catch(() => null) : null,
    ref,
  };
}

async function fetchPdsJson<T>(did: string, path: string, params: URLSearchParams): Promise<T | null> {
  const host = await resolvePdsHost(did);
  if (!host) return null;
  const response = await fetch(`https://${host}/xrpc/${path}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function fetchDirectProject(did: string, rkey: string): Promise<ManagedProject | null> {
  const data = await fetchPdsJson<GetRecordResponse>(
    did,
    "com.atproto.repo.getRecord",
    new URLSearchParams({ repo: did, collection: PROJECT_COLLECTION, rkey }),
  );
  if (!data?.value) return null;
  return directProjectFromRecord(did, { uri: data.uri, cid: data.cid, value: data.value });
}

async function directProjectFromRecord(did: string, record: ListedRecord): Promise<ManagedProject | null> {
  const value = record.value;
  if (!value) return null;
  const type = extractString(value.type);
  if (type?.toLowerCase() !== "project") return null;

  const banner = await collectionImageUrl(did, value.banner);
  const avatar = await collectionImageUrl(did, value.avatar);
  const items = Array.isArray(value.items) ? value.items.map(itemRefFromValue).filter((item): item is { uri: string; cid: string | null } => Boolean(item)) : [];
  const location = isRecord(value.location) ? extractString(value.location.uri) : null;

  return {
    kind: "project",
    id: `${did}-${rkeyFromUri(record.uri)}`,
    did,
    rkey: rkeyFromUri(record.uri),
    atUri: record.uri,
    cid: record.cid,
    title: extractString(value.title) ?? "Untitled project",
    shortDescription: extractString(value.shortDescription),
    createdAt: extractString(value.createdAt) ?? new Date(0).toISOString(),
    type,
    imageUrl: banner.url ?? avatar.url,
    imageRef: banner.ref ?? avatar.ref,
    creatorName: null,
    creatorAvatarRef: null,
    bumicertUris: items.map((item) => item.uri),
    bumicertCount: items.length,
    locationUri: location,
    rawRecord: value,
  };
}

function mergeProject(indexed: ProjectRecord | null, direct: ManagedProject | null): ManagedProject | null {
  if (!indexed && !direct) return null;
  if (!indexed) return direct;
  return {
    ...indexed,
    rawRecord: direct?.rawRecord ?? null,
    cid: indexed.cid ?? direct?.cid ?? null,
    imageUrl: indexed.imageUrl ?? direct?.imageUrl ?? null,
    imageRef: indexed.imageRef ?? direct?.imageRef ?? null,
    bumicertUris: direct ? direct.bumicertUris : indexed.bumicertUris,
    bumicertCount: direct ? direct.bumicertUris.length : indexed.bumicertCount,
    locationUri: indexed.locationUri ?? direct?.locationUri ?? null,
  };
}

async function fetchDirectBumicertFromUri(uri: string): Promise<BumicertRecord | null> {
  const did = didFromUri(uri);
  const rkey = rkeyFromUri(uri);
  if (!did || !rkey) return null;
  const data = await fetchPdsJson<GetRecordResponse>(
    did,
    "com.atproto.repo.getRecord",
    new URLSearchParams({ repo: did, collection: BUMICERT_COLLECTION, rkey }),
  );
  if (!data?.value) return null;
  return directBumicertFromRecord(did, { uri: data.uri, cid: data.cid, value: data.value });
}

async function directBumicertFromRecord(did: string, record: ListedRecord): Promise<BumicertRecord | null> {
  const value = record.value;
  if (!value) return null;
  const image = await collectionImageUrl(did, value.image);
  const locations = Array.isArray(value.locations) ? value.locations.map((location) => isRecord(location) ? extractString(location.uri) : null).filter((uri): uri is string => Boolean(uri)) : [];
  const scope = workScopeLabel(value.workScope);

  return {
    kind: "bumicert",
    id: `${did}-${rkeyFromUri(record.uri)}`,
    did,
    rkey: rkeyFromUri(record.uri),
    atUri: record.uri,
    cid: record.cid,
    title: extractString(value.title) ?? "Untitled Cert",
    shortDescription: extractString(value.shortDescription),
    startDate: extractString(value.startDate),
    endDate: extractString(value.endDate),
    contributorCount: Array.isArray(value.contributors) ? value.contributors.length : 0,
    locationCount: locations.length,
    scopeTags: scope ? [scope] : [],
    locationUris: locations,
    createdAt: extractString(value.createdAt) ?? new Date(0).toISOString(),
    imageUrl: image.url,
    imageRef: image.ref,
    creatorName: null,
    creatorAvatarRef: null,
  };
}

function workScopeLabel(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  return extractString(value.scope) ?? extractString(value.expression);
}

function mergeBumicerts(indexed: BumicertRecord[], direct: BumicertRecord[], linkedUris: Set<string>): ManagedBumicert[] {
  const merged = new Map<string, BumicertRecord>();
  for (const cert of direct) merged.set(cert.atUri, cert);
  for (const cert of indexed) merged.set(cert.atUri, { ...merged.get(cert.atUri), ...cert });
  return Array.from(merged.values())
    .map((cert) => ({ ...cert, linked: linkedUris.has(cert.atUri) }))
    .sort((a, b) => Number(b.linked) - Number(a.linked) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
