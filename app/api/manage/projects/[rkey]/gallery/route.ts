import { fetchProjectsByDid, type ProjectRecord } from "@/app/_lib/indexer";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import { isResponse, resolveManageApiTarget } from "../../../_lib/target";

export const runtime = "nodejs";

const PROJECT_COLLECTION = "org.hypercerts.collection";
const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";

type ManagedProject = ProjectRecord & {
  rawRecord: Record<string, unknown> | null;
};

type ListedRecord = {
  uri: string;
  cid: string;
  value?: Record<string, unknown>;
};

type ListedRecordsResponse = {
  cursor?: string;
  records?: ListedRecord[];
};

type GetRecordResponse = {
  uri: string;
  cid: string;
  value?: Record<string, unknown>;
};

type GalleryContentItem = {
  id: string;
  index: number;
  kind: "blob" | "uri";
  url: string;
  mimeType: string | null;
  size: number | null;
  cid: string | null;
};

type ManagedGallery = {
  id: string;
  uri: string;
  rkey: string;
  cid: string;
  title: string | null;
  shortDescription: string | null;
  createdAt: string | null;
  projectUri: string;
  projectCid: string | null;
  images: GalleryContentItem[];
  rawRecord: Record<string, unknown>;
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
    const [indexedProjects, directProject] = await Promise.all([
      fetchProjectsByDid(target.did, 500).then((page) => page.records).catch(() => []),
      fetchDirectProject(target.did, rkey).catch(() => null),
    ]);
    const indexedProject = indexedProjects.find((project) => project.rkey === rkey) ?? null;
    const project = mergeProject(indexedProject, directProject);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

    const galleries = await fetchDirectProjectGalleries(target.did, project.atUri);
    return Response.json({ project, galleries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch project gallery.";
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
    country: null,
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
    bumicertUris: indexed.bumicertUris.length > 0 ? indexed.bumicertUris : direct?.bumicertUris ?? [],
    bumicertCount: indexed.bumicertUris.length > 0 ? indexed.bumicertCount : direct?.bumicertCount ?? indexed.bumicertCount,
    locationUri: indexed.locationUri ?? direct?.locationUri ?? null,
  };
}

async function fetchDirectProjectGalleries(did: string, projectUri: string): Promise<ManagedGallery[]> {
  const all: ManagedGallery[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({ repo: did, collection: ATTACHMENT_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await fetchPdsJson<ListedRecordsResponse>(did, "com.atproto.repo.listRecords", params);
    if (!data) break;

    const galleries = await Promise.all((data.records ?? []).map((record) => mapDirectGallery(did, record, projectUri)));
    all.push(...galleries.filter((gallery): gallery is ManagedGallery => Boolean(gallery)));

    if (!data.cursor) break;
    cursor = data.cursor;
  }

  return all.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
}

function subjectForProject(subjects: unknown, projectUri: string): { uri: string; cid: string | null } | null {
  if (!Array.isArray(subjects)) return null;
  for (const subject of subjects) {
    if (!isRecord(subject)) continue;
    const uri = extractString(subject.uri);
    if (uri === projectUri) return { uri, cid: extractString(subject.cid) };
  }
  return null;
}

function isImageMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
}

function isLikelyImageUri(uri: string): boolean {
  if (uri.startsWith("data:image/")) return true;
  try {
    return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(new URL(uri).pathname);
  } catch {
    return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(uri);
  }
}

function refFromBlob(blob: unknown): string | null {
  if (!isRecord(blob)) return null;
  return extractBlobRef(blob.ref) ?? extractBlobRef(blob);
}

async function mapDirectGallery(did: string, record: ListedRecord, projectUri: string): Promise<ManagedGallery | null> {
  const value = record.value;
  if (!value || extractString(value.contentType)?.toLowerCase() !== "gallery") return null;
  const subject = subjectForProject(value.subjects, projectUri);
  if (!subject) return null;

  const content = Array.isArray(value.content) ? value.content : [];
  const images = (await Promise.all(content.map(async (item, index): Promise<GalleryContentItem | null> => {
    if (!isRecord(item)) return null;
    const itemType = extractString(item.$type);
    if (itemType === "org.hypercerts.defs#smallBlob") {
      const blob = item.blob;
      if (!isRecord(blob) || !isImageMimeType(extractString(blob.mimeType))) return null;
      const cid = refFromBlob(blob);
      if (!cid) return null;
      const url = await resolveBlobUrl(did, cid, undefined).catch(() => null);
      if (!url) return null;
      return {
        id: `${record.uri}#${index}`,
        index,
        kind: "blob",
        url,
        cid,
        mimeType: extractString(blob.mimeType),
        size: typeof blob.size === "number" ? blob.size : null,
      };
    }
    if (itemType === "org.hypercerts.defs#uri") {
      const url = extractString(item.uri);
      if (!url || !isLikelyImageUri(url)) return null;
      return {
        id: `${record.uri}#${index}`,
        index,
        kind: "uri",
        url,
        cid: null,
        mimeType: null,
        size: null,
      };
    }
    return null;
  }))).filter((image): image is GalleryContentItem => Boolean(image));

  return {
    id: record.uri,
    uri: record.uri,
    rkey: rkeyFromUri(record.uri),
    cid: record.cid,
    title: extractString(value.title),
    shortDescription: extractString(value.shortDescription),
    createdAt: extractString(value.createdAt),
    projectUri: subject.uri,
    projectCid: subject.cid,
    images,
    rawRecord: value,
  };
}
