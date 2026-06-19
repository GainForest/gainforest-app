import { getCertifiedProfileCard, resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { indexerQuery } from "@/app/_lib/indexer";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";

export const BADGE_DEFINITION_COLLECTION = "app.certified.badge.definition";
export const BADGE_AWARD_COLLECTION = "app.certified.badge.award";
export const BADGE_PENDING_AWARD_COLLECTION = "app.certified.badge.pendingAward";

export const INTERNAL_BADGE_COLLECTIONS = new Set([
  BADGE_DEFINITION_COLLECTION,
  BADGE_AWARD_COLLECTION,
  BADGE_PENDING_AWARD_COLLECTION,
]);

export type StrongRef = { uri: string; cid: string };

export type BadgeDefinitionRecord = {
  rkey: string;
  uri: string;
  cid: string;
  title: string;
  badgeType: string;
  description: string | null;
  icon: unknown | null;
  iconUrl: string | null;
  createdAt: string;
};

export type BadgeAwardRecord = {
  rkey: string;
  uri: string;
  cid: string;
  badge: StrongRef;
  badgeTitle: string | null;
  subjectKind: "did" | "record" | "unknown";
  subjectLabel: string;
  subjectDid: string | null;
  subjectHandle: string | null;
  note: string | null;
  url: string | null;
  createdAt: string;
};

export type PendingBadgeAwardRecord = {
  rkey: string;
  uri: string;
  cid: string;
  badge: StrongRef;
  badgeTitle: string | null;
  email: string;
  note: string | null;
  createdAt: string;
};

export type InternalBadgeData = {
  repoDid: string;
  definitions: BadgeDefinitionRecord[];
  awards: BadgeAwardRecord[];
  pendingAwards: PendingBadgeAwardRecord[];
};

type ListedRecord = {
  uri?: unknown;
  cid?: unknown;
  value?: unknown;
};

type ListRecordsResponse = {
  records?: ListedRecord[];
  cursor?: string;
};

type IndexerConnection<N> = {
  edges?: Array<{ node?: N | null } | null> | null;
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
};

type BadgeDefinitionNode = {
  uri: string;
  cid: string;
  rkey: string;
  title: string;
  badgeType: string;
  description?: string | null;
  icon?: { ref: string; mimeType: string; size: number } | null;
  createdAt: string;
};

type BadgeAwardNode = {
  uri: string;
  cid: string;
  rkey: string;
  badge: { uri?: string | null; cid?: string | null };
  subject: ({ __typename?: string; did?: string | null; uri?: string | null; cid?: string | null }) | null;
  note?: string | null;
  url?: string | null;
  createdAt: string;
};

type BadgeIndexerPayload = {
  appCertifiedBadgeDefinition?: IndexerConnection<BadgeDefinitionNode> | null;
  appCertifiedBadgeAward?: IndexerConnection<BadgeAwardNode> | null;
};

const BADGE_INDEXER_QUERY = `
  query InternalBadges($repo: String!, $first: Int!, $afterDefinitions: String, $afterAwards: String) {
    appCertifiedBadgeDefinition(
      first: $first
      after: $afterDefinitions
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { uri cid rkey title badgeType description createdAt icon { ref mimeType size } } }
    }
    appCertifiedBadgeAward(
      first: $first
      after: $afterAwards
      where: { did: { eq: $repo } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          uri cid rkey createdAt note url
          badge { uri cid }
          subject {
            __typename
            ... on AppCertifiedDefsDid { did }
            ... on ComAtprotoRepoStrongRef { uri cid }
          }
        }
      }
    }
  }
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function blobCid(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const ref = value.ref;
  if (typeof ref === "string") return ref;
  if (isRecord(ref) && typeof ref.$link === "string") return ref.$link;
  if (typeof value.$link === "string") return value.$link;
  return null;
}

function asStrongRef(value: unknown): StrongRef | null {
  if (!isRecord(value)) return null;
  const uri = stringValue(value.uri);
  const cid = stringValue(value.cid);
  return uri && cid ? { uri, cid } : null;
}

async function listCollection(repoDid: string, collection: string): Promise<ListedRecord[]> {
  const host = await resolvePdsHost(repoDid);
  if (!host) throw new Error("Could not find the badge data store.");

  const records: ListedRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ repo: repoDid, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (!response.ok) {
      const errorPayload = payload as (ListRecordsResponse & { message?: unknown; error?: unknown }) | null;
      const maybeMessage = stringValue(errorPayload?.message) ?? stringValue(errorPayload?.error);
      throw new Error(maybeMessage ?? "Could not load badge records.");
    }
    if (Array.isArray(payload?.records)) records.push(...payload.records);
    cursor = stringValue(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }
  return records;
}

async function normalizeDefinition(repoDid: string, entry: ListedRecord): Promise<BadgeDefinitionRecord | null> {
  const uri = stringValue(entry.uri);
  const cid = stringValue(entry.cid);
  const value = entry.value;
  if (!uri || !cid || !isRecord(value)) return null;
  const title = stringValue(value.title);
  const badgeType = stringValue(value.badgeType);
  const createdAt = stringValue(value.createdAt);
  if (!title || !badgeType || !createdAt) return null;
  const iconRef = blobCid(value.icon);
  return {
    rkey: rkeyFromUri(uri),
    uri,
    cid,
    title,
    badgeType,
    description: stringValue(value.description),
    icon: isRecord(value.icon) ? value.icon : null,
    iconUrl: iconRef ? await resolveBlobUrl(repoDid, iconRef).catch(() => null) : null,
    createdAt,
  };
}

async function normalizeIndexerDefinition(repoDid: string, node: BadgeDefinitionNode): Promise<BadgeDefinitionRecord> {
  const icon = node.icon ? { $type: "blob", ref: node.icon.ref, mimeType: node.icon.mimeType, size: node.icon.size } : null;
  return {
    rkey: node.rkey,
    uri: node.uri,
    cid: node.cid,
    title: node.title,
    badgeType: node.badgeType,
    description: node.description?.trim() || null,
    icon,
    iconUrl: node.icon?.ref ? await resolveBlobUrl(repoDid, node.icon.ref).catch(() => null) : null,
    createdAt: node.createdAt,
  };
}

async function didLabel(did: string): Promise<{ label: string; handle: string | null }> {
  const profile = await getCertifiedProfileCard(did).catch(() => null);
  const handle = profile?.handle ?? null;
  const display = profile?.displayName?.trim();
  return { label: display || handle || did, handle };
}

async function normalizeAward(entry: ListedRecord, definitions: Map<string, BadgeDefinitionRecord>): Promise<BadgeAwardRecord | null> {
  const uri = stringValue(entry.uri);
  const cid = stringValue(entry.cid);
  const value = entry.value;
  if (!uri || !cid || !isRecord(value)) return null;
  const badge = asStrongRef(value.badge);
  const createdAt = stringValue(value.createdAt);
  if (!badge || !createdAt) return null;

  return normalizeAwardParts({
    rkey: rkeyFromUri(uri),
    uri,
    cid,
    badge,
    subject: value.subject,
    note: stringValue(value.note),
    url: stringValue(value.url),
    createdAt,
    definitions,
  });
}

async function normalizeIndexerAward(node: BadgeAwardNode, definitions: Map<string, BadgeDefinitionRecord>): Promise<BadgeAwardRecord | null> {
  const badgeUri = stringValue(node.badge.uri);
  const badgeCid = stringValue(node.badge.cid);
  if (!badgeUri || !badgeCid) return null;
  return normalizeAwardParts({
    rkey: node.rkey,
    uri: node.uri,
    cid: node.cid,
    badge: { uri: badgeUri, cid: badgeCid },
    subject: node.subject,
    note: node.note?.trim() || null,
    url: node.url?.trim() || null,
    createdAt: node.createdAt,
    definitions,
  });
}

async function normalizeAwardParts(input: {
  rkey: string;
  uri: string;
  cid: string;
  badge: StrongRef;
  subject: unknown;
  note: string | null;
  url: string | null;
  createdAt: string;
  definitions: Map<string, BadgeDefinitionRecord>;
}): Promise<BadgeAwardRecord> {
  const subject = input.subject;
  let subjectKind: BadgeAwardRecord["subjectKind"] = "unknown";
  let subjectLabel = "Unknown recipient";
  let subjectDid: string | null = null;
  let subjectHandle: string | null = null;

  if (isRecord(subject) && typeof subject.did === "string") {
    subjectKind = "did";
    subjectDid = subject.did;
    const identity = await didLabel(subject.did);
    subjectLabel = identity.label;
    subjectHandle = identity.handle;
  } else {
    const recordRef = asStrongRef(subject);
    if (recordRef) {
      subjectKind = "record";
      subjectLabel = recordRef.uri;
    }
  }

  return {
    rkey: input.rkey,
    uri: input.uri,
    cid: input.cid,
    badge: input.badge,
    badgeTitle: input.definitions.get(input.badge.uri)?.title ?? null,
    subjectKind,
    subjectLabel,
    subjectDid,
    subjectHandle,
    note: input.note,
    url: input.url,
    createdAt: input.createdAt,
  };
}

function normalizePendingAward(entry: ListedRecord, definitions: Map<string, BadgeDefinitionRecord>): PendingBadgeAwardRecord | null {
  const uri = stringValue(entry.uri);
  const cid = stringValue(entry.cid);
  const value = entry.value;
  if (!uri || !cid || !isRecord(value)) return null;
  const badge = asStrongRef(value.badge);
  const email = stringValue(value.email);
  const createdAt = stringValue(value.createdAt);
  if (!badge || !email || !createdAt) return null;
  return {
    rkey: rkeyFromUri(uri),
    uri,
    cid,
    badge,
    badgeTitle: definitions.get(badge.uri)?.title ?? null,
    email,
    note: stringValue(value.note),
    createdAt,
  };
}

async function fetchIndexedBadgeRecords(repoDid: string, includeAwards: boolean): Promise<{ definitions: BadgeDefinitionRecord[]; awards: BadgeAwardRecord[] } | null> {
  const definitionNodes: BadgeDefinitionNode[] = [];
  const awardNodes: BadgeAwardNode[] = [];
  let afterDefinitions: string | null = null;
  let afterAwards: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const shouldCollectDefinitions: boolean = page === 0 || Boolean(afterDefinitions);
    const payload: BadgeIndexerPayload | null = await indexerQuery<BadgeIndexerPayload>(BADGE_INDEXER_QUERY, {
      repo: repoDid,
      first: 100,
      afterDefinitions,
      afterAwards,
    });
    if (!payload) return null;

    const definitionsPage: IndexerConnection<BadgeDefinitionNode> | null | undefined = payload.appCertifiedBadgeDefinition;
    const awardsPage: IndexerConnection<BadgeAwardNode> | null | undefined = payload.appCertifiedBadgeAward;
    if (shouldCollectDefinitions) {
      definitionNodes.push(...((definitionsPage?.edges ?? []).flatMap((edge: { node?: BadgeDefinitionNode | null } | null) => edge?.node ? [edge.node] : [])));
    }
    if (includeAwards) {
      awardNodes.push(...((awardsPage?.edges ?? []).flatMap((edge: { node?: BadgeAwardNode | null } | null) => edge?.node ? [edge.node] : [])));
    }

    afterDefinitions = shouldCollectDefinitions && definitionsPage?.pageInfo?.hasNextPage ? definitionsPage.pageInfo.endCursor ?? null : null;
    afterAwards = includeAwards && awardsPage?.pageInfo?.hasNextPage ? awardsPage.pageInfo.endCursor ?? null : null;

    if (!afterDefinitions && !afterAwards) break;
  }

  const definitions = uniqueByUri(await Promise.all(definitionNodes.map((node) => normalizeIndexerDefinition(repoDid, node))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const definitionsByUri = new Map(definitions.map((definition) => [definition.uri, definition]));
  const awards = includeAwards
    ? uniqueByUri((await Promise.all(awardNodes.map((node) => normalizeIndexerAward(node, definitionsByUri))))
        .filter((entry): entry is BadgeAwardRecord => Boolean(entry)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return { definitions, awards };
}

async function fetchDirectBadgeRecords(repoDid: string, includeAwards: boolean): Promise<{ definitions: BadgeDefinitionRecord[]; awards: BadgeAwardRecord[] }> {
  const [definitionEntries, awardEntries] = await Promise.all([
    listCollection(repoDid, BADGE_DEFINITION_COLLECTION).catch(() => []),
    includeAwards ? listCollection(repoDid, BADGE_AWARD_COLLECTION).catch(() => []) : Promise.resolve([]),
  ]);

  const definitions = uniqueByUri((await Promise.all(definitionEntries.map((entry) => normalizeDefinition(repoDid, entry))))
    .filter((entry): entry is BadgeDefinitionRecord => Boolean(entry)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const definitionsByUri = new Map(definitions.map((definition) => [definition.uri, definition]));

  const awards = includeAwards
    ? uniqueByUri((await Promise.all(awardEntries.map((entry) => normalizeAward(entry, definitionsByUri))))
        .filter((entry): entry is BadgeAwardRecord => Boolean(entry)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  return { definitions, awards };
}

function uniqueByUri<T extends { uri: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.uri)) return false;
    seen.add(entry.uri);
    return true;
  });
}

function mergeByUri<T extends { uri: string }>(preferred: T[], fallback: T[]): T[] {
  const dedupedPreferred = uniqueByUri(preferred);
  const seen = new Set(dedupedPreferred.map((entry) => entry.uri));
  return [...dedupedPreferred, ...fallback.filter((entry) => !seen.has(entry.uri))];
}

export async function fetchInternalBadgeData(repoDid: string, options: { includeAwards?: boolean } = {}): Promise<InternalBadgeData> {
  const includeAwards = options.includeAwards ?? true;
  const indexed = await fetchIndexedBadgeRecords(repoDid, includeAwards).catch(() => null);
  const direct = await fetchDirectBadgeRecords(repoDid, includeAwards).catch(() => ({ definitions: [], awards: [] }));
  const canonical = indexed
    ? {
        definitions: mergeByUri(indexed.definitions, direct.definitions).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        awards: mergeByUri(indexed.awards, direct.awards).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }
    : direct;
  const definitionsByUri = new Map(canonical.definitions.map((definition) => [definition.uri, definition]));
  const pendingEntries = includeAwards ? await listCollection(repoDid, BADGE_PENDING_AWARD_COLLECTION).catch(() => []) : [];
  const pendingAwards = pendingEntries
    .map((entry) => normalizePendingAward(entry, definitionsByUri))
    .filter((entry): entry is PendingBadgeAwardRecord => Boolean(entry))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { repoDid, definitions: canonical.definitions, awards: canonical.awards, pendingAwards };
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function handleCandidates(identifier: string): string[] {
  const cleaned = identifier.trim().replace(/^@+/, "");
  if (!cleaned || cleaned.startsWith("did:") || cleaned.includes(".")) return [cleaned];
  const defaultDomain = (process.env.NEXT_PUBLIC_DEFAULT_PDS_DOMAIN || process.env.DEFAULT_PDS_DOMAIN || "certified.one")
    .trim()
    .replace(/^@+|\.+$/g, "");
  return Array.from(new Set([cleaned, defaultDomain ? `${cleaned}.${defaultDomain}` : cleaned]));
}

export async function resolveBadgeRecipient(identifier: string) {
  const normalized = identifier.trim();
  if (!normalized) return { kind: "empty" as const };
  if (isLikelyEmail(normalized)) return { kind: "email" as const, email: normalized.toLowerCase() };

  let did: string | null = normalized.startsWith("did:") ? normalized : null;
  if (!did) {
    for (const candidate of handleCandidates(normalized)) {
      did = await resolveIdentifierToDid(candidate).catch(() => null);
      if (did?.startsWith("did:")) break;
    }
  }
  if (!did?.startsWith("did:")) return { kind: "notFound" as const };

  const profile = await getCertifiedProfileCard(did).catch(() => null);
  return {
    kind: "did" as const,
    did,
    handle: profile?.handle ?? null,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
  };
}
