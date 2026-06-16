/**
 * DID → profile (handle + display name + avatar) resolution.
 *
 * Same approach hyperscan and simocracy-v2 use: hydrate identities through the
 * public Bluesky AppView (`public.api.bsky.app`, CORS-open). It resolves any
 * ATProto DID's handle even when the repo lives on a GainForest PDS
 * (certified.one / climateai.org), e.g. did:plc:t3ev… → reforestrees.climateai.org.
 * If AppView has no name, fall back to this app's `app.certified.actor.profile`
 * reader so CGS members still show their Certified profile name.
 *
 * Two refinements over a naive per-card fetch:
 *   - Results are cached for the session and in-flight requests are deduped.
 *   - Requests are micro-batched (60ms window) into `getProfiles` calls and a
 *     same-origin certified-profile fallback, so grids avoid per-card waterfalls.
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
    let profiles: AppViewProfile[] = [];
    try {
      const params = chunk.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
      const res = await fetch(`${APPVIEW}?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { profiles?: AppViewProfile[] };
        profiles = data.profiles ?? [];
      }
    } catch {
      /* network error → the certified-profile fallback below still gets a chance */
    }

    const appViewByDid = new Map(profiles.filter((p) => p.did).map((p) => [p.did!, p]));
    const resolved = new Map<string, DidProfile>();
    for (const did of chunk) {
      const profile = appViewByDid.get(did);
      resolved.set(
        did,
        profile
          ? {
              did,
              handle: nonEmpty(profile.handle),
              displayName: nonEmpty(profile.displayName),
              avatar: nonEmpty(profile.avatar),
            }
          : fallback(did),
      );
    }

    const missingNames = chunk.filter((did) => !resolved.get(did)?.displayName);
    const certifiedByDid = await fetchCertifiedCards(missingNames);
    for (const did of missingNames) {
      const certified = certifiedByDid.get(did);
      if (!certified) continue;
      const current = resolved.get(did) ?? fallback(did);
      resolved.set(did, {
        did,
        handle: current.handle ?? nonEmpty(certified.handle),
        displayName: current.displayName || nonEmpty(certified.displayName),
        avatar: current.avatar ?? nonEmpty(certified.avatar),
      });
    }

    for (const did of chunk) settle(did, resolved.get(did) ?? fallback(did));
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
