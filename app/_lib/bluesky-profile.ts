/**
 * Bluesky (public atproto appview) helpers.
 *
 * These let us add external Bluesky accounts as organization members: resolve a
 * Bluesky handle to a DID, and read a public profile card (handle, display name,
 * avatar) when the account has no Certified profile record of its own.
 *
 * Handle resolution mirrors the rest of the app, which resolves atproto handles
 * against `bsky.social` (see app/_lib/cgs-server.ts). Both hosts are
 * configurable so self-hosted deployments can point at their own appview/PDS.
 */

const APPVIEW_BASE = (process.env.BLUESKY_APPVIEW_URL || "https://public.api.bsky.app").replace(/\/+$/, "");
const IDENTITY_BASE = (process.env.BLUESKY_IDENTITY_URL || "https://bsky.social").replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 5000;

export type BlueskyProfileCard = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function asDid(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("did:") ? value : null;
}

function cleanHandle(value: string): string {
  return value.trim().replace(/^@+/, "");
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve a Bluesky handle (e.g. `alice.bsky.social`) to a DID via the atproto
 * identity endpoint. Returns the DID unchanged when a DID is passed in, or null
 * when the handle cannot be resolved.
 */
export async function resolveBlueskyHandleToDid(handle: string): Promise<string | null> {
  const cleaned = cleanHandle(handle);
  if (!cleaned) return null;
  if (cleaned.startsWith("did:")) return asDid(cleaned);

  const params = new URLSearchParams({ handle: cleaned });
  const response = await fetch(`${IDENTITY_BASE}/xrpc/com.atproto.identity.resolveHandle?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) return null;

  const payload = (await response.json().catch(() => null)) as { did?: unknown } | null;
  return asDid(payload?.did);
}

/**
 * Typeahead search for public Bluesky actors by name or handle. Returns an
 * empty list when the appview is unreachable or the query is blank.
 */
export async function searchBlueskyActors(query: string, limit = 8): Promise<BlueskyProfileCard[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({ q, limit: String(Math.max(1, Math.min(limit, 25))) });
  const response = await fetch(`${APPVIEW_BASE}/xrpc/app.bsky.actor.searchActorsTypeahead?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = (await response.json().catch(() => null)) as
    | { actors?: Array<{ did?: unknown; handle?: unknown; displayName?: unknown; avatar?: unknown }> }
    | null;

  const results: BlueskyProfileCard[] = [];
  for (const actor of payload?.actors ?? []) {
    const did = asDid(actor?.did);
    if (!did) continue;
    const handle = nonEmpty(actor?.handle);
    results.push({
      did,
      handle: handle && handle !== "handle.invalid" ? handle : null,
      displayName: nonEmpty(actor?.displayName),
      avatarUrl: nonEmpty(actor?.avatar),
    });
  }
  return results;
}

/**
 * Read a public Bluesky profile card for a DID or handle. Returns null when the
 * account has no Bluesky presence.
 */
export async function fetchBlueskyProfileCard(actor: string): Promise<BlueskyProfileCard | null> {
  const cleaned = cleanHandle(actor);
  if (!cleaned) return null;

  const params = new URLSearchParams({ actor: cleaned });
  const response = await fetch(`${APPVIEW_BASE}/xrpc/app.bsky.actor.getProfile?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) return null;

  const payload = (await response.json().catch(() => null)) as
    | { did?: unknown; handle?: unknown; displayName?: unknown; avatar?: unknown }
    | null;
  const did = asDid(payload?.did);
  if (!did) return null;

  const handle = nonEmpty(payload?.handle);
  return {
    did,
    handle: handle && handle !== "handle.invalid" ? handle : null,
    displayName: nonEmpty(payload?.displayName),
    avatarUrl: nonEmpty(payload?.avatar),
  };
}
