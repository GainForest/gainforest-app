/**
 * PDS resolution + blob URL building.
 *
 * Record images (occurrence photos, bumicert covers, org logos) are stored
 * as blob refs on each record owner's Personal Data Server. To turn a
 * `{ ref }` into a fetchable image we resolve the DID → PDS host via
 * plc.directory, then build a `com.atproto.sync.getBlob` URL.
 *
 * Both plc.directory and the PDS sync endpoint serve
 * `access-control-allow-origin: *`, so this runs equally well in the browser
 * (the record grids) and on the server (KPI prefetch). A module-scoped cache
 * makes repeated DIDs free within a session.
 */

import { withAbort } from "./async-cache";

type DidDocument = {
  alsoKnownAs?: unknown;
  service?: Array<{ type?: string; serviceEndpoint?: string }>;
};

// Cache the in-flight promise (not just the settled value) so concurrent
// resolutions of the same DID — e.g. 48 bumicert covers owned by a handful of
// orgs — share one plc.directory request instead of firing duplicates. The
// whole DID document is cached so PDS-host and handle resolution share one
// fetch.
const didDocCache = new Map<string, Promise<DidDocument | null>>();

/** DID document URL for a did:web (per the did:web spec). */
function didWebDocUrl(did: string): string {
  const segments = did.slice("did:web:".length).split(":").map(decodeURIComponent);
  const [host, ...path] = segments;
  return path.length
    ? `https://${host}/${path.join("/")}/did.json`
    : `https://${host}/.well-known/did.json`;
}

function lookupDidDocument(did: string): Promise<DidDocument | null> {
  let promise = didDocCache.get(did);
  if (!promise) {
    const url = did.startsWith("did:web:") ? didWebDocUrl(did) : `https://plc.directory/${did}`;
    const lookup: Promise<DidDocument | null> = fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<DidDocument>) : null))
      .catch(() => {
        // Network failure: drop the entry so a later call can retry, but
        // resolve null for everyone currently waiting on this lookup.
        if (didDocCache.get(did) === lookup) didDocCache.delete(did);
        return null;
      });
    promise = lookup;
    didDocCache.set(did, promise);
  }
  return promise;
}

export function resolvePdsHost(
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  // did:web serves from its own host — no document fetch needed.
  if (did.startsWith("did:web:")) {
    return withAbort(Promise.resolve(did.slice("did:web:".length).replace(/:/g, "/")), signal);
  }
  const promise = lookupDidDocument(did).then((doc) => {
    const endpoint = doc?.service?.find(
      (s) => s.type === "AtprotoPersonalDataServer",
    )?.serviceEndpoint;
    try {
      return endpoint ? new URL(endpoint).host : null;
    } catch {
      return null;
    }
  });
  // The underlying lookup keeps running (and fills the cache) even if this
  // caller aborts; only the caller's await is rejected.
  return withAbort(promise, signal);
}

/**
 * Read an account's handle from its DID document (`alsoKnownAs`). Works for
 * every atproto account — certified-network or Bluesky — since handles live at
 * the identity layer, not in any app record. Shares the cached DID-document
 * fetch with `resolvePdsHost`, so calling both costs one request.
 */
export async function resolveDidHandle(
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!did.startsWith("did:")) return null;
  const doc = await withAbort(lookupDidDocument(did), signal).catch(() => null);
  const aka = Array.isArray(doc?.alsoKnownAs) ? doc.alsoKnownAs : [];
  for (const entry of aka) {
    if (typeof entry === "string" && entry.startsWith("at://")) {
      const handle = entry.slice("at://".length).trim();
      if (handle) return handle;
    }
  }
  return null;
}

/** Normalise an indexer blob ref. Hyperindex sometimes serialises a ref as a
 *  Go map string ("map[$link:bafkrei…]") instead of a bare CID; this extracts
 *  the CID either way. Mirrors hyperscan's extractTypedImage. */
export function normaliseRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith("b") || ref.startsWith("Q")) return ref;
  const m = ref.match(/\$link:([a-zA-Z0-9]+)/);
  return m ? m[1] : ref;
}

/** Build a public blob URL from a DID + ref, resolving the PDS host. */
export async function resolveBlobUrl(
  did: string,
  ref: string | null | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const cid = normaliseRef(ref);
  if (!cid) return null;
  const host = await resolvePdsHost(did, signal);
  if (!host) return null;
  return blobUrl(host, did, cid);
}

/** Compose a sync.getBlob URL from already-resolved parts. */
export function blobUrl(host: string, did: string, cid: string): string {
  return `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`;
}

/** True for our resolved PDS blob URLs. next/image can optimize these (their
 *  host pattern is allowlisted in next.config and large originals benefit).
 *  Arbitrary record image URIs (e.g. a bumicert cover on some random host)
 *  are NOT — they must be served `unoptimized` so the optimizer never has to
 *  allowlist an unbounded set of hosts. */
export function isPdsBlobUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.includes("/xrpc/com.atproto.sync.getBlob"));
}

// ── Strong references (uri + cid) ─────────────────────────────────────────

/** A content-addressed reference to a record, per com.atproto.repo.strongRef:
 *  the AT-URI plus the content-hash of the exact record version. Required by
 *  the app.gainforest.feed.* like/reply subjects. */
export type StrongRef = { uri: string; cid: string };

/** Split `at://did/collection/rkey` into its parts. */
export function parseAtUri(
  uri: string,
): { did: string; collection: string; rkey: string } | null {
  const m = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

/**
 * Resolve any record AT-URI to a strongRef (`{ uri, cid }`) by reading the
 * record from its owner's PDS. `com.atproto.repo.getRecord` is a public,
 * CORS-open read (same trust model as blob fetching), so this works in the
 * browser and on the server. The returned `uri` is the PDS-canonical one, and
 * `cid` pins the exact version — exactly what a like/reply subject needs.
 */
export async function resolveStrongRef(
  uri: string,
  signal?: AbortSignal,
): Promise<StrongRef> {
  const parts = parseAtUri(uri);
  if (!parts) throw new Error("That item can't be referenced (malformed link).");
  const host = await resolvePdsHost(parts.did, signal);
  if (!host) throw new Error("We couldn't reach that item to reference it. Please try again.");
  const params = new URLSearchParams({
    repo: parts.did,
    collection: parts.collection,
    rkey: parts.rkey,
  });
  const res = await fetch(
    `https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
    { signal },
  ).catch(() => null);
  const payload = (await res?.json().catch(() => null)) as
    | { uri?: unknown; cid?: unknown }
    | null;
  if (!res?.ok || typeof payload?.uri !== "string" || typeof payload?.cid !== "string") {
    throw new Error("We couldn't reference that item. Please try again.");
  }
  return { uri: payload.uri, cid: payload.cid };
}

/** A full record read straight from its owner's PDS. */
export type PdsRecord = { uri: string; cid: string | null; value: Record<string, unknown> };

/**
 * Read one record directly from its owner's PDS via the public
 * `com.atproto.repo.getRecord`. Returns null when the record (or the PDS)
 * can't be reached. Used to distinguish "doesn't exist" from "exists but the
 * indexer hasn't caught up yet" for freshly created records.
 */
export async function getPdsRecord(
  did: string,
  collection: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<PdsRecord | null> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return null;
  const params = new URLSearchParams({ repo: did, collection, rkey });
  const res = await fetch(
    `https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
    { signal, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  const payload = (await res.json().catch(() => null)) as
    | { uri?: unknown; cid?: unknown; value?: unknown }
    | null;
  if (typeof payload?.uri !== "string" || typeof payload.value !== "object" || payload.value === null) return null;
  return {
    uri: payload.uri,
    cid: typeof payload.cid === "string" ? payload.cid : null,
    value: payload.value as Record<string, unknown>,
  };
}

/**
 * Drop AT-URIs whose records have been deleted from their owner's PDS.
 *
 * A record that links other records by strongRef (e.g. a Cert's `locations`)
 * can outlive its targets — deleting a linked record does not rewrite the
 * documents that point at it. Rendering such a dangling ref produces broken
 * embeds (the sidebar map iframes `locations[0]` and shows "Unable to
 * preview" when that record is gone).
 *
 * Fail-open by design: a URI is only dropped when its PDS positively answers
 * `RecordNotFound`. Network failures, unreachable PDS hosts, and other errors
 * keep the URI, so a PDS outage never makes existing places disappear.
 */
export async function dropDeletedRecordUris(
  uris: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  if (uris.length === 0) return uris;
  const checked = await Promise.all(
    uris.map(async (uri) => {
      const parts = parseAtUri(uri);
      if (!parts) return uri;
      const host = await resolvePdsHost(parts.did, signal).catch(() => null);
      if (!host) return uri;
      const params = new URLSearchParams({
        repo: parts.did,
        collection: parts.collection,
        rkey: parts.rkey,
      });
      const res = await fetch(
        `https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
        { signal, cache: "no-store" },
      ).catch(() => null);
      if (!res || res.ok) return uri;
      const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return payload?.error === "RecordNotFound" ? null : uri;
    }),
  );
  return checked.filter((uri): uri is string => uri !== null);
}

/**
 * The collections a repo actually holds records in.
 *
 * A repo only lists a collection once something has been written to it, so
 * this answers "does this account have any X at all?" for the price of one
 * small request — where listing the records themselves could mean megabytes
 * of record bodies just to find out the answer is none.
 */
export async function listRepoCollections(
  did: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return [];
  const params = new URLSearchParams({ repo: did });
  const res = await fetch(
    `https://${host}/xrpc/com.atproto.repo.describeRepo?${params.toString()}`,
    { signal, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return [];
  const payload = (await res.json().catch(() => null)) as { collections?: unknown } | null;
  if (!Array.isArray(payload?.collections)) return [];
  return payload.collections.filter((entry): entry is string => typeof entry === "string");
}

/**
 * List the newest records of a collection straight from the owner's PDS
 * (public `com.atproto.repo.listRecords`, newest-first). One page only — this
 * exists to surface freshly written records the indexer hasn't seen yet, not
 * to replace indexer listings.
 */
export async function listLatestPdsRecords(
  did: string,
  collection: string,
  limit = 24,
  signal?: AbortSignal,
): Promise<PdsRecord[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return [];
  const params = new URLSearchParams({ repo: did, collection, limit: String(limit) });
  const res = await fetch(
    `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
    { signal, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return [];
  const payload = (await res.json().catch(() => null)) as { records?: unknown } | null;
  if (!Array.isArray(payload?.records)) return [];
  const records: PdsRecord[] = [];
  for (const item of payload.records) {
    if (typeof item !== "object" || item === null) continue;
    const { uri, cid, value } = item as { uri?: unknown; cid?: unknown; value?: unknown };
    if (typeof uri !== "string" || typeof value !== "object" || value === null) continue;
    records.push({ uri, cid: typeof cid === "string" ? cid : null, value: value as Record<string, unknown> });
  }
  return records;
}
