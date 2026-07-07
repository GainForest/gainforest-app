/**
 * DID → identity (handle + PDS host) resolution from the DID document.
 *
 * Used by member lists to label accounts: Bluesky / generic atproto accounts
 * are shown by their handle (public info from the DID document's
 * `alsoKnownAs`), while ePDS accounts (hosted on the configured email-first
 * PDS, certified.one by default) are candidates for showing the member's
 * email instead — the email itself comes from other, access-gated sources.
 *
 * Server-side only. Results are cached per DID for the lifetime of the
 * process; concurrent lookups of the same DID share one request.
 */

export type DidIdentity = {
  handle: string | null;
  pdsHost: string | null;
};

const EMPTY_IDENTITY: DidIdentity = { handle: null, pdsHost: null };

const identityCache = new Map<string, Promise<DidIdentity>>();

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

  const response = await fetch(url, { cache: "no-store" });
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

export function resolveDidIdentity(did: string): Promise<DidIdentity> {
  if (!did.startsWith("did:")) return Promise.resolve(EMPTY_IDENTITY);
  let promise = identityCache.get(did);
  if (!promise) {
    const lookup = lookupDidIdentity(did).catch(() => {
      // Network failure: drop the entry so a later call can retry.
      if (identityCache.get(did) === lookup) identityCache.delete(did);
      return EMPTY_IDENTITY;
    });
    promise = lookup;
    identityCache.set(did, promise);
  }
  return promise;
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
