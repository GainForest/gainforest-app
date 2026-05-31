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

const pdsHostCache = new Map<string, string | null>();

export async function resolvePdsHost(
  did: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (pdsHostCache.has(did)) return pdsHostCache.get(did) ?? null;
  // did:web resolves to its own host without a plc lookup.
  if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replace(/:/g, "/");
    pdsHostCache.set(did, host);
    return host;
  }
  try {
    const res = await fetch(`https://plc.directory/${did}`, { signal });
    if (!res.ok) {
      pdsHostCache.set(did, null);
      return null;
    }
    const doc: { service?: Array<{ type?: string; serviceEndpoint?: string }> } =
      await res.json();
    const endpoint = doc.service?.find(
      (s) => s.type === "AtprotoPersonalDataServer",
    )?.serviceEndpoint;
    const host = endpoint ? new URL(endpoint).host : null;
    pdsHostCache.set(did, host);
    return host;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    pdsHostCache.set(did, null);
    return null;
  }
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
