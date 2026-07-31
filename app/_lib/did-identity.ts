/**
 * DID → identity (handle + PDS host) resolution from the DID document.
 *
 * Used by member lists to label accounts: Bluesky / generic atproto accounts
 * are shown by their handle (public info from the DID document's
 * `alsoKnownAs`), while ePDS accounts (hosted on the configured email-first
 * PDS, certified.one by default) are candidates for showing the member's
 * email instead — the email itself comes from other, access-gated sources.
 *
 * Server-side only. Results are cached per DID for a few minutes (a handle can
 * change at any time, so the cache must expire); concurrent lookups of the same
 * DID share one request.
 */

import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";

export type DidIdentity = {
  handle: string | null;
  pdsHost: string | null;
};

const EMPTY_IDENTITY: DidIdentity = { handle: null, pdsHost: null };

const CACHE_PREFIX = "did-identity:";
const CACHE_TTL_MS = 5 * 60 * 1000;

type DidDocument = {
  alsoKnownAs?: unknown;
  service?: Array<{ type?: string; serviceEndpoint?: string }>;
};

function didDocumentUrl(did: string): string | null {
  if (did.startsWith("did:plc:")) return `https://plc.directory/${did}`;
  if (did.startsWith("did:web:")) {
    // did:web:host[:path:segments] — the host is the first segment.
    const host = did.slice("did:web:".length).split(":")[0];
    return host ? `https://${host}/.well-known/did.json` : null;
  }
  return null;
}

async function lookupDidIdentity(did: string): Promise<DidIdentity> {
  const url = didDocumentUrl(did);
  if (!url) return EMPTY_IDENTITY;

  // This sits on the critical path of every signed-in request (the session's
  // username is reconciled against the DID document), so a hung directory must
  // not hang the page — time out and fall back to the session's username.
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) return EMPTY_IDENTITY;
  const doc = (await response.json().catch(() => null)) as DidDocument | null;
  if (!doc) return EMPTY_IDENTITY;

  const aka = Array.isArray(doc.alsoKnownAs)
    ? doc.alsoKnownAs.find((value): value is string => typeof value === "string" && value.startsWith("at://"))
    : undefined;
  const handle = aka ? aka.slice("at://".length).trim() || null : null;

  const endpoint = doc.service?.find((service) => service.type === "AtprotoPersonalDataServer")?.serviceEndpoint;
  let pdsHost: string | null = null;
  if (endpoint) {
    try {
      pdsHost = new URL(endpoint).host;
    } catch {
      pdsHost = null;
    }
  }

  return { handle, pdsHost };
}

/**
 * `freshness` (optional) is folded into the cache key: pass a value that
 * changes when the caller knows the identity just changed (the username-change
 * cookie), and instances still holding the pre-change identity under the old
 * key will look it up again instead of serving it for the rest of the TTL.
 */
export function resolveDidIdentity(did: string, freshness?: string | null): Promise<DidIdentity> {
  if (!did.startsWith("did:")) return Promise.resolve(EMPTY_IDENTITY);
  const key = freshness ? `${CACHE_PREFIX}${did}:${freshness}` : `${CACHE_PREFIX}${did}`;
  // A rejected loader drops itself from the cache, so a later call can retry.
  return cachedAsync(key, CACHE_TTL_MS, () => lookupDidIdentity(did)).catch(() => EMPTY_IDENTITY);
}

/** Forget the cached identity for one DID. Called right after the user changes
 *  their username so this instance re-reads it at once instead of after the
 *  TTL. Other serverless instances keep their copy for up to the TTL — the
 *  page the user is on updates client-side, so they still see the change. */
export function forgetDidIdentity(did: string): void {
  invalidateCachedAsyncByPrefix(`${CACHE_PREFIX}${did}`);
}

/** Hosts that identify the configured ePDS (email-first PDS). */
export function getEpdsHosts(): string[] {
  const hosts = new Set<string>();
  const domain = (process.env.NEXT_PUBLIC_DEFAULT_PDS_DOMAIN || process.env.DEFAULT_PDS_DOMAIN || "certified.one")
    .trim()
    .replace(/^@+|\.+$/g, "")
    .toLowerCase();
  if (domain) hosts.add(domain);
  const epdsUrl = process.env.NEXT_PUBLIC_EPDS_URL?.trim();
  if (epdsUrl) {
    try {
      hosts.add(new URL(epdsUrl).host.toLowerCase());
    } catch {
      // Ignore malformed env value.
    }
  }
  return [...hosts];
}

/**
 * Whether the account lives on the configured ePDS. Prefers the PDS host from
 * the DID document; falls back to the handle suffix when the host lookup
 * failed (ePDS handles live under the default PDS domain).
 */
export function isEpdsIdentity(identity: DidIdentity): boolean {
  const hosts = getEpdsHosts();
  const pdsHost = identity.pdsHost?.toLowerCase();
  if (pdsHost && hosts.includes(pdsHost)) return true;
  const handle = identity.handle?.toLowerCase();
  return Boolean(handle && hosts.some((host) => handle === host || handle.endsWith(`.${host}`)));
}
