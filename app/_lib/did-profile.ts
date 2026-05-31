/**
 * DID → profile (handle + display name + avatar) resolution.
 *
 * Same approach hyperscan and simocracy-v2 use: hydrate identities through the
 * public Bluesky AppView (`public.api.bsky.app`, CORS-open). It resolves any
 * ATProto DID's handle even when the repo lives on a GainForest PDS
 * (certified.one / climateai.org), e.g. did:plc:t3ev… → reforestrees.climateai.org.
 *
 * Two refinements over a naive per-card fetch:
 *   - Results are cached for the session and in-flight requests are deduped.
 *   - Requests are micro-batched (60ms window) into `getProfiles` calls of up
 *     to 25 actors, so a grid of 24 cards costs one or two round-trips, not 24.
 *
 * Avatars: GainForest community/org DIDs usually have no app.bsky.actor.profile
 * avatar, so `avatar` is frequently null; callers render a deterministic
 * monogram fallback. Bluesky-native donors do return a CDN avatar.
 */

export type DidProfile = {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
};

const APPVIEW = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles";
const BATCH_WINDOW_MS = 60;
const BATCH_SIZE = 25;

const cache = new Map<string, DidProfile>();
const inflight = new Map<string, Promise<DidProfile>>();
const waiters = new Map<string, Array<(p: DidProfile) => void>>();
let queue: string[] = [];
let scheduled = false;

function fallback(did: string): DidProfile {
  return { did, handle: null, displayName: null, avatar: null };
}

function settle(did: string, profile: DidProfile) {
  cache.set(did, profile);
  inflight.delete(did);
  const ws = waiters.get(did);
  if (ws) {
    waiters.delete(did);
    for (const w of ws) w(profile);
  }
}

async function flush() {
  scheduled = false;
  const batch = [...new Set(queue)];
  queue = [];
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    let profiles: Array<{ did?: string; handle?: string; displayName?: string; avatar?: string }> = [];
    try {
      const params = chunk.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
      const res = await fetch(`${APPVIEW}?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { profiles?: typeof profiles };
        profiles = data.profiles ?? [];
      }
    } catch {
      /* network error → everyone in the chunk gets the fallback below */
    }
    const byDid = new Map(profiles.filter((p) => p.did).map((p) => [p.did!, p]));
    for (const did of chunk) {
      const p = byDid.get(did);
      settle(
        did,
        p
          ? {
              did,
              handle: p.handle ?? null,
              displayName: p.displayName ?? null,
              avatar: p.avatar ?? null,
            }
          : fallback(did),
      );
    }
  }
}

export function getCachedProfile(did: string): DidProfile | undefined {
  return cache.get(did);
}

export function resolveDidProfile(did: string): Promise<DidProfile> {
  if (!did || !did.startsWith("did:")) return Promise.resolve(fallback(did));
  const cached = cache.get(did);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(did);
  if (existing) return existing;

  const promise = new Promise<DidProfile>((resolve) => {
    const arr = waiters.get(did) ?? [];
    arr.push(resolve);
    waiters.set(did, arr);
  });
  inflight.set(did, promise);
  queue.push(did);
  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, BATCH_WINDOW_MS);
  }
  return promise;
}

// ── Monogram avatar fallback ───────────────────────────────────────────────

// Muted palette drawn from the design tokens so generated avatars sit on the
// cream surface without shouting.
const MONOGRAM_BG = ["#3e7053", "#5b7c8c", "#9a6b4f", "#7a7a52", "#6b5b8c", "#427058"];

export function monogram(handle: string | null, did: string): { char: string; bg: string } {
  const source = handle ?? did.split(":").pop() ?? did;
  const char = (source.replace(/^@/, "")[0] ?? "?").toUpperCase();
  let hash = 0;
  for (let i = 0; i < did.length; i++) hash = (hash * 31 + did.charCodeAt(i)) >>> 0;
  return { char, bg: MONOGRAM_BG[hash % MONOGRAM_BG.length] };
}
