/**
 * Global search — the data layer behind the top-right ⌘K command palette.
 *
 * Unlike the explore pages (which page a single record stream), the palette
 * searches Projects, People, Organizations, and Observations at once. Each
 * stream is a thin wrapper over the existing indexer
 * fetchers, which already push the user's query down to Hyperindex as a
 * server-side `contains` filter — so this stays a handful of cheap queries
 * per keystroke (debounced upstream) instead of downloading a whole corpus.
 * Queries that look like an atproto identifier (`@alice.bsky.social`,
 * `did:plc:…`) additionally resolve to an exact account.
 *
 * Everything runs in the browser, directly against the indexer, exactly like
 * the explore grids. `Promise.allSettled` keeps one slow/failed stream from
 * blanking the others.
 */

import {
  fetchPublicHiddenAccountDids,
  fetchProjects,
  searchAccountsByName,
  fetchOrganizationDids,
  fetchAccountSearchResult,
  walkOccurrences,
  isLikelyTestRecordName,
} from "./indexer";
import {
  localProjectHref,
  localObservationHref,
  accountHref,
} from "./urls";

export type GlobalSearchKind = "project" | "person" | "organization" | "observation";

/** A single result row in the palette. */
export type GlobalSearchHit = {
  kind: GlobalSearchKind;
  /** Stable key for React lists + active-row tracking. */
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Owner DID — lets the avatar/thumbnail resolve a PDS blob lazily. */
  did?: string;
  /** Organization avatar blob ref (CID), resolved on render. */
  avatarRef?: string | null;
  /** Ready-to-render image URL (external thumbnails / hosted covers). */
  imageUrl?: string | null;
};

/** One group of results, in display order. */
type GlobalSearchSection = {
  kind: GlobalSearchKind;
  hits: GlobalSearchHit[];
};

export type GlobalSearchResults = {
  sections: GlobalSearchSection[];
  /** Flattened, in section order — drives keyboard navigation. */
  flat: GlobalSearchHit[];
  totalCount: number;
};

/** Don't fire until the query is at least this long — avoids hammering the
 *  indexer on a single stray character. */
export const MIN_QUERY_LENGTH = 2;

/** Per-section result cap. Keeps the dropdown compact and the queries light. */
const PER_KIND_CAP = 5;

/** One account query feeds two sections (people + organizations), so it asks
 *  for more rows than a single section shows. */
const ACCOUNT_FETCH_LIMIT = PER_KIND_CAP * 2;

/** Section order in the palette. */
const KIND_ORDER: GlobalSearchKind[] = ["project", "person", "organization", "observation"];

const EMPTY_RESULTS: GlobalSearchResults = { sections: [], flat: [], totalCount: 0 };

// ── Accounts (people + organizations) ────────────────────────────────────

type AccountMatch = {
  did: string;
  displayName: string | null;
  avatarRef: string | null;
  isOrganization: boolean;
  handle: string | null;
};

/** Pull an atproto identifier out of the query, if it looks like one: a DID,
 *  or a handle (`alice.bsky.social`, with or without the leading `@`).
 *  Free-text names (spaces, no dot) can never resolve, so they're skipped. */
function identifierFromQuery(query: string): string | null {
  const cleaned = query.replace(/^@+/, "").trim().toLowerCase();
  if (cleaned.startsWith("did:")) return cleaned;
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(cleaned)) return null;
  return cleaned;
}

// Handle↔DID lookups hit public, CORS-open identity endpoints directly from
// the browser (like the rest of the palette) and are cached across keystrokes.
const didByHandle = new Map<string, Promise<string | null>>();
const handleByDid = new Map<string, Promise<string | null>>();

const IDENTITY_RESOLVERS = ["https://public.api.bsky.app", "https://bsky.social"];

function resolveHandleToDid(handle: string): Promise<string | null> {
  let pending = didByHandle.get(handle);
  if (!pending) {
    pending = (async () => {
      for (const base of IDENTITY_RESOLVERS) {
        const params = new URLSearchParams({ handle });
        const res = await fetch(`${base}/xrpc/com.atproto.identity.resolveHandle?${params.toString()}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
        if (!res?.ok) continue;
        const payload = (await res.json().catch(() => null)) as { did?: unknown } | null;
        if (typeof payload?.did === "string" && payload.did.startsWith("did:")) return payload.did;
      }
      return null;
    })();
    didByHandle.set(handle, pending);
    // Let a transient network failure be retried on the next keystroke.
    pending.then((did) => {
      if (!did) didByHandle.delete(handle);
    });
  }
  return pending;
}

/** Best-effort handle for a DID — shown as the result's subtitle so
 *  same-named accounts stay distinguishable. */
function fetchHandleForDid(did: string): Promise<string | null> {
  let pending = handleByDid.get(did);
  if (!pending) {
    pending = (async () => {
      if (did.startsWith("did:web:")) {
        return did.slice("did:web:".length).split(":")[0] || null;
      }
      if (!did.startsWith("did:plc:")) return null;
      const res = await fetch(`https://plc.directory/${did}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);
      if (!res?.ok) return null;
      const doc = (await res.json().catch(() => null)) as { alsoKnownAs?: unknown } | null;
      const aka = Array.isArray(doc?.alsoKnownAs) ? doc.alsoKnownAs : [];
      const first = aka.find((v): v is string => typeof v === "string" && v.startsWith("at://"));
      return first ? first.slice("at://".length) || null : null;
    })();
    handleByDid.set(did, pending);
    pending.then((handle) => {
      if (!handle) handleByDid.delete(did);
    });
  }
  return pending;
}

/** Exact handle/DID lookup: resolve the identifier, then check the indexer
 *  for that account. Accounts with no presence on the network stay hidden. */
async function findAccountByIdentifier(
  query: string,
  signal?: AbortSignal,
): Promise<(AccountMatch & { exact: true }) | null> {
  const identifier = identifierFromQuery(query);
  if (!identifier) return null;
  const did = identifier.startsWith("did:") ? identifier : await resolveHandleToDid(identifier);
  if (!did) return null;
  const account = await fetchAccountSearchResult(did, signal);
  if (!account) return null;
  return { ...account, handle: null, exact: true };
}

/** Search accounts by display name and by exact handle/DID, split into people
 *  vs organizations, with handles joined in for subtitles. */
async function searchAccounts(query: string, signal?: AbortSignal): Promise<AccountMatch[]> {
  const [byName, exact] = await Promise.all([
    searchAccountsByName(query, ACCOUNT_FETCH_LIMIT, signal).catch(() => []),
    findAccountByIdentifier(query, signal).catch(() => null),
  ]);

  const merged: Array<Omit<AccountMatch, "isOrganization"> & { isOrganization: boolean | null }> = [];
  const seen = new Set<string>();
  if (exact) {
    merged.push(exact);
    seen.add(exact.did);
  }
  for (const account of byName) {
    if (seen.has(account.did)) continue;
    seen.add(account.did);
    merged.push({ ...account, handle: null, isOrganization: null });
  }
  if (merged.length === 0) return [];

  // One extra query splits the name matches into people vs organizations;
  // handles resolve in parallel (cached, best-effort).
  const unknownDids = merged.filter((m) => m.isOrganization === null).map((m) => m.did);
  const [orgDids, handles] = await Promise.all([
    unknownDids.length > 0
      ? fetchOrganizationDids(unknownDids, signal).catch(() => new Set<string>())
      : Promise.resolve(new Set<string>()),
    Promise.all(merged.map((m) => fetchHandleForDid(m.did).catch(() => null))),
  ]);

  return merged.map((m, i) => ({
    did: m.did,
    displayName: m.displayName,
    avatarRef: m.avatarRef,
    isOrganization: m.isOrganization ?? orgDids.has(m.did),
    handle: handles[i],
  }));
}

function observationTitle(record: {
  vernacularName: string | null;
  scientificName: string | null;
}): string {
  return record.vernacularName?.trim() || record.scientificName?.trim() || "Sighting";
}

function observationSubtitle(record: {
  vernacularName: string | null;
  scientificName: string | null;
  locality: string | null;
  country: string | null;
}): string | null {
  // Prefer the scientific name as a subtitle when the common name is the
  // title; otherwise fall back to where it was seen.
  if (record.vernacularName?.trim() && record.scientificName?.trim()) {
    return record.scientificName.trim();
  }
  return record.locality?.trim() || record.country?.trim() || null;
}

/**
 * Search Projects, Organizations, and Observations for `query` and return them
 * grouped + flattened. Returns empty for queries shorter than
 * {@link MIN_QUERY_LENGTH}. Each stream is independent — a failure in one
 * leaves the others intact.
 */
export async function searchEverything(
  query: string,
  signal?: AbortSignal,
): Promise<GlobalSearchResults> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return EMPTY_RESULTS;

  // Accounts a steward flagged as "test", and accounts hosted on a blocked
  // server address, never surface in search — neither the accounts themselves
  // nor any of their projects / observations. Resolved once (cached) and
  // applied as a final guard over every stream's results.
  const hidden = await fetchPublicHiddenAccountDids(signal).catch(() => new Set<string>());

  const [projectResult, accountResult, observationResult] = await Promise.allSettled([
    fetchProjects(PER_KIND_CAP, null, signal, undefined, {
      query: q,
      featuredBadgesOnly: false,
    }),
    searchAccounts(q, signal),
    walkOccurrences({
      media: "all",
      target: PER_KIND_CAP,
      after: null,
      query: q,
      signal,
      // Skip per-result blob resolution — the palette shows external
      // thumbnails when present and a kind icon otherwise, so a getBlob
      // round-trip per keystroke would be wasted work.
      resolveMedia: false,
    }),
  ]);

  const byKind: Record<GlobalSearchKind, GlobalSearchHit[]> = {
    project: [],
    person: [],
    organization: [],
    observation: [],
  };

  if (projectResult.status === "fulfilled") {
    for (const record of projectResult.value.records) {
      if (hidden.has(record.did) || isLikelyTestRecordName(record.title)) continue;
      byKind.project.push({
        kind: "project",
        id: record.id,
        title: record.title,
        subtitle: record.shortDescription,
        href: localProjectHref(record.did, record.rkey),
        did: record.did,
        imageUrl: record.imageUrl,
      });
    }
  }

  if (accountResult.status === "fulfilled") {
    for (const account of accountResult.value) {
      if (hidden.has(account.did) || isLikelyTestRecordName(account.displayName)) continue;
      const handle = account.handle ? `@${account.handle}` : null;
      const title = account.displayName ?? handle;
      if (!title) continue;
      byKind[account.isOrganization ? "organization" : "person"].push({
        kind: account.isOrganization ? "organization" : "person",
        id: account.did,
        title,
        subtitle: handle === title ? null : handle,
        href: accountHref(account.did),
        did: account.did,
        avatarRef: account.avatarRef,
      });
    }
  }

  if (observationResult.status === "fulfilled") {
    for (const record of observationResult.value.records) {
      if (
        hidden.has(record.did) ||
        isLikelyTestRecordName(record.scientificName) ||
        isLikelyTestRecordName(record.vernacularName)
      ) {
        continue;
      }
      byKind.observation.push({
        kind: "observation",
        id: record.id,
        title: observationTitle(record),
        subtitle: observationSubtitle(record),
        href: localObservationHref(record.did, record.rkey),
        did: record.did,
        imageUrl: record.imageUrl,
      });
    }
  }

  const sections: GlobalSearchSection[] = [];
  const flat: GlobalSearchHit[] = [];
  let totalCount = 0;
  for (const kind of KIND_ORDER) {
    const hits = byKind[kind].slice(0, PER_KIND_CAP);
    if (hits.length === 0) continue;
    sections.push({ kind, hits });
    flat.push(...hits);
    totalCount += hits.length;
  }

  return { sections, flat, totalCount };
}
