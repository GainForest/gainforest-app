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
  fetchAccountCards,
  walkOccurrences,
  isLikelyTestRecordName,
  type AccountCard,
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

// Handle lookups hit public, CORS-open atproto endpoints directly from the
// browser (like the rest of the palette) and are cached across keystrokes.
const didByHandle = new Map<string, Promise<string | null>>();

const IDENTITY_RESOLVERS = ["https://public.api.bsky.app", "https://bsky.social"];

/** Public appview used for handle prefix matching. */
const APPVIEW_BASE = "https://public.api.bsky.app";

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

/** Exact handle/DID lookup: resolve the identifier to a DID. */
async function didFromIdentifierQuery(query: string): Promise<string | null> {
  const identifier = identifierFromQuery(query);
  if (!identifier) return null;
  if (identifier.startsWith("did:")) return identifier;
  return resolveHandleToDid(identifier);
}

/**
 * DIDs whose handle matches the query as a prefix, via the public appview's
 * actor typeahead.
 *
 * The indexer can return an account's handle but cannot search by one, so
 * partial handles (`sharfyae`) would otherwise find nothing. The appview
 * indexes handles across the network — including this app's own `certified.one`
 * accounts — so it fills exactly that gap. Its matches are only *candidates*:
 * every DID is checked against the indexer afterwards, so accounts with no
 * presence here never reach the palette.
 */
async function actorsByHandlePrefix(
  query: string,
  limit: number,
): Promise<Array<{ did: string; handle: string }>> {
  const q = query.replace(/^@+/, "").trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`${APPVIEW_BASE}/xrpc/app.bsky.actor.searchActorsTypeahead?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const payload = (await res.json().catch(() => null)) as
    | { actors?: Array<{ did?: unknown; handle?: unknown }> }
    | null;
  const actors: Array<{ did: string; handle: string }> = [];
  for (const actor of payload?.actors ?? []) {
    // Only handle matches are wanted here — display-name matches already come
    // from the indexer, and the appview's names can disagree with ours.
    const handle = typeof actor?.handle === "string" ? actor.handle : "";
    if (!handle.toLowerCase().includes(q.toLowerCase())) continue;
    if (typeof actor?.did === "string" && actor.did.startsWith("did:")) {
      actors.push({ did: actor.did, handle });
    }
  }
  return actors;
}

// Last-resort handle lookup for accounts the indexer can't join a handle onto
// (older indexer deployments lack that field). Cached across keystrokes.
const plcHandleByDid = new Map<string, Promise<string | null>>();

function fetchHandleFromPlc(did: string): Promise<string | null> {
  let pending = plcHandleByDid.get(did);
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
    plcHandleByDid.set(did, pending);
    pending.then((handle) => {
      if (!handle) plcHandleByDid.delete(did);
    });
  }
  return pending;
}

/** Search accounts by display name and by handle (exact or partial), split
 *  into people vs organizations. */
async function searchAccounts(query: string, signal?: AbortSignal): Promise<AccountMatch[]> {
  const [byName, exactDid, handleActors] = await Promise.all([
    searchAccountsByName(query, ACCOUNT_FETCH_LIMIT, signal).catch(() => []),
    didFromIdentifierQuery(query).catch(() => null),
    actorsByHandlePrefix(query, ACCOUNT_FETCH_LIMIT).catch(() => []),
  ]);

  // One round trip covers both open questions: whether each name match is an
  // organization, and whether each handle match exists on GainForest at all.
  const handleByDidFromAppview = new Map(handleActors.map((a) => [a.did, a.handle]));
  const typedIdentifier = identifierFromQuery(query);
  const allDids = [
    ...new Set([
      ...byName.map((a) => a.did),
      ...(exactDid ? [exactDid] : []),
      ...handleActors.map((a) => a.did),
    ]),
  ];
  const cards = allDids.length > 0
    ? await fetchAccountCards(allDids, signal).catch(() => new Map<string, AccountCard>())
    : new Map<string, AccountCard>();

  const merged: AccountMatch[] = [];
  const seen = new Set<string>();
  const push = (match: AccountMatch | undefined) => {
    if (!match || seen.has(match.did)) return;
    seen.add(match.did);
    merged.push(match);
  };

  // Handles prefer the indexer's own join, but older indexer deployments don't
  // have it — fall back to what the appview said, or what the user typed.
  const handleFor = (did: string, indexed: string | null): string | null =>
    indexed ??
    handleByDidFromAppview.get(did) ??
    (did === exactDid && typedIdentifier && !typedIdentifier.startsWith("did:") ? typedIdentifier : null);

  // An exactly-typed handle or DID is the most specific thing the user can ask
  // for, so it leads — then name matches, then partial handle matches.
  if (exactDid) {
    const card = cards.get(exactDid);
    if (card) push({ ...card, handle: handleFor(exactDid, card.handle) });
  }
  for (const account of byName) {
    push({
      did: account.did,
      displayName: account.displayName,
      avatarRef: account.avatarRef,
      handle: handleFor(account.did, account.handle ?? cards.get(account.did)?.handle ?? null),
      isOrganization: cards.get(account.did)?.isOrganization ?? false,
    });
  }
  for (const actor of handleActors) {
    const card = cards.get(actor.did);
    if (card) push({ ...card, handle: handleFor(actor.did, card.handle) });
  }

  // Whatever still has no handle gets a last-resort directory lookup — cached,
  // best-effort, and only needed on indexer deployments without the handle join.
  await Promise.all(
    merged.map(async (match) => {
      if (match.handle) return;
      match.handle = await fetchHandleFromPlc(match.did).catch(() => null);
    }),
  );

  return merged;
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
