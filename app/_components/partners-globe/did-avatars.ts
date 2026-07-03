/**
 * DID → avatar URL resolution for the Partners globe.
 *
 * Trimmed port of bumicerts-clean-rewrite's `app/_lib/did-profile.ts`
 * (only the avatar is needed here). Identities hydrate from the merged
 * app's Certified profile-card endpoint via this landing's same-origin
 * proxy at `/api/partner-cards` (the upstream serves no CORS headers).
 *
 * Same refinements as the source:
 *   - Results are cached for the session; in-flight requests are deduped.
 *   - Requests are micro-batched (60 ms window, 25 DIDs per request) so
 *     the ~680-marker roster doesn't fan out into per-org waterfalls.
 */

const BATCH_WINDOW_MS = 60;
const BATCH_SIZE = 25;

type CardProfile = { did?: string; avatar?: string | null };

const cache = new Map<string, string | null>();
const waiters = new Map<string, Array<(avatar: string | null) => void>>();
let queue: string[] = [];
let scheduled = false;

async function fetchCards(dids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (dids.length === 0) return out;
  const params = new URLSearchParams();
  for (const did of dids) params.append("did", did);
  try {
    const res = await fetch(`/api/partner-cards?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return out;
    const data = (await res.json()) as { profiles?: CardProfile[] };
    for (const profile of data.profiles ?? []) {
      if (typeof profile.did === "string") {
        out.set(profile.did, profile.avatar?.trim() || null);
      }
    }
  } catch {
    /* resolve everything in this batch to null below */
  }
  return out;
}

function settle(did: string, avatar: string | null) {
  cache.set(did, avatar);
  const callbacks = waiters.get(did);
  waiters.delete(did);
  callbacks?.forEach((cb) => cb(avatar));
}

async function flush() {
  scheduled = false;
  const dids = queue;
  queue = [];
  for (let i = 0; i < dids.length; i += BATCH_SIZE) {
    const chunk = dids.slice(i, i + BATCH_SIZE);
    const profiles = await fetchCards(chunk);
    for (const did of chunk) settle(did, profiles.get(did) ?? null);
  }
}

/** Resolve one DID's avatar URL (null when the org has none). */
export function resolveDidAvatar(did: string): Promise<string | null> {
  const cached = cache.get(did);
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const list = waiters.get(did);
    if (list) {
      list.push(resolve);
      return;
    }
    waiters.set(did, [resolve]);
    queue.push(did);
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => void flush(), BATCH_WINDOW_MS);
    }
  });
}
