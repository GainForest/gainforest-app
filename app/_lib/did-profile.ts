/**
 * DID → profile (handle + display name + avatar) resolution.
 *
 * Hydrate identities from the app's Certified profile card endpoint plus the
 * public Bluesky AppView (`public.api.bsky.app`, CORS-open). Certified profile
 * names and avatars win; AppView fills in handles and account-level fallbacks.
 *
 * Two refinements over a naive per-card fetch:
 *   - Results are cached for the session and in-flight requests are deduped.
 *   - Requests are micro-batched (60ms window) into batched AppView lookups and
 *     a same-origin Certified profile endpoint, so grids avoid per-card waterfalls.
 *
 * Avatars: when no Certified/AppView avatar exists, callers render a deterministic
 * monogram fallback.
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

type AppViewProfile = { did?: string; handle?: string; displayName?: string; avatar?: string };
type AccountCardProfile = { did?: string; handle?: string | null; displayName?: string | null; avatar?: string | null };

const cache = new Map<string, DidProfile>();
const inflight = new Map<string, Promise<DidProfile>>();
const waiters = new Map<string, Array<(p: DidProfile) => void>>();
let queue: string[] = [];
let scheduled = false;

function fallback(did: string): DidProfile {
  return { did, handle: null, displayName: null, avatar: null };
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function fetchCertifiedCards(dids: string[]): Promise<Map<string, AccountCardProfile>> {
  if (dids.length === 0) return new Map();
  const params = new URLSearchParams();
  for (const did of dids) params.append("did", did);

  try {
    const res = await fetch(`/api/account/cards?${params.toString()}`, { headers: { accept: "application/json" } });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { profiles?: AccountCardProfile[] };
    return new Map((data.profiles ?? []).filter((profile) => typeof profile.did === "string").map((profile) => [profile.did!, profile]));
  } catch {
    return new Map();
  }
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
    const appViewPromise = (async () => {
      try {
        const params = chunk.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
        const res = await fetch(`${APPVIEW}?${params}`);
        if (!res.ok) return [] as AppViewProfile[];
        const data = (await res.json()) as { profiles?: AppViewProfile[] };
        return data.profiles ?? [];
      } catch {
        return [] as AppViewProfile[];
      }
    })();
    const certifiedPromise = fetchCertifiedCards(chunk);
    const [profiles, certifiedByDid] = await Promise.all([appViewPromise, certifiedPromise]);

    const appViewByDid = new Map(profiles.filter((p) => p.did).map((p) => [p.did!, p]));
    for (const did of chunk) {
      const appView = appViewByDid.get(did);
      const certified = certifiedByDid.get(did);
      settle(did, {
        did,
        handle: nonEmpty(appView?.handle) ?? nonEmpty(certified?.handle),
        displayName: nonEmpty(certified?.displayName) ?? nonEmpty(appView?.displayName),
        avatar: nonEmpty(certified?.avatar) ?? nonEmpty(appView?.avatar),
      });
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
