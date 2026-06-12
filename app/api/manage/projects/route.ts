import { fetchProjectsByDid, type ProjectRecord } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../_lib/target";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

type ManagedProject = ProjectRecord & {
  rawRecord: Record<string, unknown> | null;
};

type ListedRecord = {
  uri: string;
  cid: string;
  value?: Record<string, unknown>;
};

type ListedRecordsResponse = {
  records?: ListedRecord[];
};

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const [indexedProjects, directProjects] = await Promise.all([
      fetchProjectsByDid(target.did, 500).then((page) => page.records).catch(() => []),
      fetchDirectProjects(target.did).catch(() => []),
    ]);
    return Response.json(mergeProjects(indexedProjects, directProjects));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch projects.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
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

function itemUriFromValue(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const itemIdentifier = isRecord(value.itemIdentifier) ? value.itemIdentifier : value;
  return extractString(itemIdentifier.uri);
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

async function directProjectFromRecord(did: string, record: ListedRecord): Promise<ManagedProject | null> {
  const value = record.value;
  if (!value) return null;
  const type = extractString(value.type);
  if (type?.toLowerCase() !== "project") return null;

  const banner = await collectionImageUrl(did, value.banner);
  const avatar = await collectionImageUrl(did, value.avatar);
  const items = Array.isArray(value.items) ? value.items.map(itemUriFromValue).filter((uri): uri is string => Boolean(uri)) : [];
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
    bumicertUris: items,
    bumicertCount: items.length,
    locationUri: location,
    rawRecord: value,
  };
}

async function fetchDirectProjects(did: string): Promise<ManagedProject[]> {
  const host = await resolvePdsHost(did);
  if (!host) return [];
  const params = new URLSearchParams({ repo: did, collection: "org.hypercerts.collection", limit: "100" });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = (await response.json()) as ListedRecordsResponse;
  const projects = await Promise.all((data.records ?? []).map((record) => directProjectFromRecord(did, record)));
  return projects.filter((project): project is ManagedProject => Boolean(project));
}

function mergeProjects(indexed: ProjectRecord[], direct: ManagedProject[]): ManagedProject[] {
  const merged = new Map<string, ManagedProject>();
  for (const project of direct) merged.set(project.atUri, project);
  for (const project of indexed) {
    const directProject = merged.get(project.atUri);
    merged.set(project.atUri, {
      ...project,
      rawRecord: directProject?.rawRecord ?? null,
      imageUrl: project.imageUrl ?? directProject?.imageUrl ?? null,
      imageRef: project.imageRef ?? directProject?.imageRef ?? null,
      bumicertUris: project.bumicertUris.length > 0 ? project.bumicertUris : directProject?.bumicertUris ?? [],
      bumicertCount: project.bumicertUris.length > 0 ? project.bumicertCount : directProject?.bumicertCount ?? project.bumicertCount,
      locationUri: project.locationUri ?? directProject?.locationUri ?? null,
    });
  }
  return Array.from(merged.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
