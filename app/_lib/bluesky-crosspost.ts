"use client";

/**
 * Bluesky cross-posting — optional twin-publishing of feed posts.
 *
 * app.gainforest.feed.post is a faithful port of app.bsky.feed.post, so a
 * cross-post is simply the SAME record body written a second time into the
 * user's own repo under the `app.bsky.feed.post` collection — Bluesky's relay
 * picks it up from the PDS and the post surfaces on bsky.app. We reuse the
 * GainForest post's rkey for the twin, which makes the mapping deterministic:
 * at://did/app.gainforest.feed.post/RKEY ⇄ at://did/app.bsky.feed.post/RKEY,
 * and the public URL is always https://bsky.app/profile/DID/post/RKEY.
 *
 * Opt-in and consent live in `app.gainforest.actor.preferences` (rkey "self")
 * on the user's PDS — same singleton pattern as app.gainforest.notification.seen.
 * Cross-posting is personal-repo only (never CGS/organization repos) and only
 * for TOP-LEVEL posts: a reply's parent is a GainForest record that doesn't
 * exist on the Bluesky appview, so a cross-posted reply could never thread.
 *
 * Twin writes are best-effort by design: the GainForest post is the source of
 * truth and must never fail because Bluesky did.
 */

import { createRecord, deleteRecord, getRecord, putRecord } from "@/app/(manage)/manage/_lib/mutations";
import { getPdsRecord, parseAtUri } from "./pds";

export const BLUESKY_POST_COLLECTION = "app.bsky.feed.post";
export const BLUESKY_PROFILE_COLLECTION = "app.bsky.actor.profile";
export const CROSSPOST_PREFS_COLLECTION = "app.gainforest.actor.preferences";
const SELF_RKEY = "self";
const CERTIFIED_PROFILE_COLLECTION = "app.certified.actor.profile";

/** Public appview used for read-only presence/profile checks. Mirrors
 *  app/_lib/bluesky-profile.ts. */
const APPVIEW_BASE = (process.env.NEXT_PUBLIC_BLUESKY_APPVIEW_URL || "https://public.api.bsky.app").replace(/\/+$/, "");

/** Canonical bsky.app URL for a cross-posted twin. */
export function blueskyPostUrl(did: string, rkey: string): string {
  return `https://bsky.app/profile/${encodeURIComponent(did)}/post/${encodeURIComponent(rkey)}`;
}

/** Canonical bsky.app URL for an account. */
export function blueskyProfileUrl(did: string): string {
  return `https://bsky.app/profile/${encodeURIComponent(did)}`;
}

// ── Preference (opt-in + consent) ────────────────────────────────────────────

export type BlueskyCrosspostPref = {
  /** Cross-posting currently switched on. */
  enabled: boolean;
  /** The account has been through the consent modal at least once. */
  consented: boolean;
};

/** Read the cross-post preference straight from the owner's PDS (public read,
 *  no session needed). Absent record = never opted in. */
export async function readBlueskyCrosspostPref(did: string): Promise<BlueskyCrosspostPref> {
  const record = await getPdsRecord(did, CROSSPOST_PREFS_COLLECTION, SELF_RKEY).catch(() => null);
  if (!record) return { enabled: false, consented: false };
  return {
    enabled: record.value.blueskyCrosspost === true,
    consented: typeof record.value.blueskyConsentAt === "string",
  };
}

/** Persist the cross-post preference to the viewer's own repo. `consentedAt`
 *  is stamped on the first consent and preserved on later toggles. */
export async function saveBlueskyCrosspostPref(did: string, enabled: boolean): Promise<void> {
  const existing = await getPdsRecord(did, CROSSPOST_PREFS_COLLECTION, SELF_RKEY).catch(() => null);
  const consentAt =
    typeof existing?.value.blueskyConsentAt === "string"
      ? existing.value.blueskyConsentAt
      : new Date().toISOString();
  await putRecord(CROSSPOST_PREFS_COLLECTION, SELF_RKEY, {
    $type: CROSSPOST_PREFS_COLLECTION,
    blueskyCrosspost: enabled,
    blueskyConsentAt: consentAt,
  });
}

// ── Bluesky profile bootstrap ────────────────────────────────────────────────

/** Whether the account already declares a Bluesky profile record. Checks the
 *  account's own PDS first, then the public Bluesky appview as a fallback
 *  (an account the appview already knows definitely has a presence). Null
 *  means "couldn't check" and callers should treat it as unknown, not missing. */
export async function hasBlueskyProfile(did: string): Promise<boolean | null> {
  const record = await getPdsRecord(did, BLUESKY_PROFILE_COLLECTION, SELF_RKEY).catch(() => null);
  if (record) return true;
  // The PDS read can fail for reasons other than "no record" (unreachable
  // host, odd did:web setups); the appview is a second, independent signal.
  const params = new URLSearchParams({ actor: did });
  const res = await fetch(`${APPVIEW_BASE}/xrpc/app.bsky.actor.getProfile?${params.toString()}`, {
    headers: { accept: "application/json" },
  }).catch(() => null);
  if (res?.ok) return true;
  // getPdsRecord folds "not found" and "unreachable" into null; distinguish by
  // asking for the certified profile, which every GainForest account has. If
  // that also fails the PDS is unreachable and we report "unknown".
  const certified = await getPdsRecord(did, CERTIFIED_PROFILE_COLLECTION, SELF_RKEY).catch(() => null);
  return certified ? false : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Grapheme-safe-enough truncation: chars ≥ graphemes, so a char slice always
 *  satisfies a maxGraphemes bound. */
function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Create the account's Bluesky profile (app.bsky.actor.profile, rkey "self")
 * from their certified profile when it doesn't exist yet. The avatar blob is
 * reused by reference — blobs are repo-scoped and both records live in the
 * same repo — but only when it satisfies Bluesky's constraints (png/jpeg,
 * ≤ 1MB); the write is retried without the avatar if the PDS rejects it.
 * No-op when a Bluesky profile is already there.
 */
export async function ensureBlueskyProfile(did: string): Promise<void> {
  if ((await hasBlueskyProfile(did)) === true) return;

  const certified = await getPdsRecord(did, CERTIFIED_PROFILE_COLLECTION, SELF_RKEY).catch(() => null);
  const source = certified?.value ?? {};

  const record: Record<string, unknown> = {
    $type: BLUESKY_PROFILE_COLLECTION,
    createdAt: new Date().toISOString(),
  };
  const displayName = clip(source.displayName, 64);
  if (displayName) record.displayName = displayName;
  const description = clip(source.description, 256);
  if (description) record.description = description;

  // Certified avatars are wrapped as org.hypercerts.defs#smallImage { image: blob }.
  const avatarWrap = asRecord(source.avatar);
  const avatarBlob = asRecord(avatarWrap?.image);
  const mimeType = typeof avatarBlob?.mimeType === "string" ? avatarBlob.mimeType : null;
  const size = typeof avatarBlob?.size === "number" ? avatarBlob.size : null;
  const avatarOk = avatarBlob && (mimeType === "image/png" || mimeType === "image/jpeg") && size !== null && size <= 1_000_000;

  // createRecord (not putRecord) so an existing profile can never be
  // clobbered: if the existence checks above misfired, the PDS rejects a
  // create for an rkey that's already taken and the user's real Bluesky
  // profile stays untouched.
  if (avatarOk) {
    try {
      await createRecord(BLUESKY_PROFILE_COLLECTION, { ...record, avatar: avatarBlob }, SELF_RKEY);
      return;
    } catch {
      // Blob constraints can still fail server-side (e.g. stale metadata);
      // fall through and try the profile without the avatar. If the failure
      // was "record exists", the retry below fails the same way — harmless.
    }
  }
  try {
    await createRecord(BLUESKY_PROFILE_COLLECTION, record, SELF_RKEY);
  } catch {
    // Most likely the profile already exists (existence check couldn't see
    // it) — exactly the case we must not overwrite, so swallow and move on.
  }
}

// ── Twin post writes (best-effort) ───────────────────────────────────────────

/** Write the app.bsky.feed.post twin of a just-created GainForest post, using
 *  the SAME rkey. Returns the bsky.app URL, or null when the write failed —
 *  the GainForest post always stands on its own. */
export async function crosspostToBluesky(input: {
  did: string;
  rkey: string;
  text: string;
  langs?: string[];
  tags?: string[];
}): Promise<string | null> {
  const record: Record<string, unknown> = {
    $type: BLUESKY_POST_COLLECTION,
    text: input.text,
    createdAt: new Date().toISOString(),
  };
  if (input.langs?.length) record.langs = input.langs.slice(0, 3);
  if (input.tags?.length) record.tags = input.tags.slice(0, 8);
  try {
    await createRecord(BLUESKY_POST_COLLECTION, record, input.rkey);
    return blueskyPostUrl(input.did, input.rkey);
  } catch {
    return null;
  }
}

/** Best-effort text edit of an existing twin. Note Bluesky's appview treats
 *  posts as immutable, so bsky.app may keep showing the original text; the
 *  record itself stays consistent for anyone reading the repo. */
export async function updateBlueskyTwin(rkey: string, text: string): Promise<void> {
  try {
    const existing = await getRecord(BLUESKY_POST_COLLECTION, rkey);
    await putRecord(BLUESKY_POST_COLLECTION, rkey, { ...existing.record, text }, { swapRecord: existing.cid ?? undefined });
  } catch {
    // No twin (posted before opting in, or the twin write failed) — fine.
  }
}

/** Best-effort delete of a twin when its GainForest post is deleted. */
export async function deleteBlueskyTwin(rkey: string): Promise<void> {
  try {
    await deleteRecord(BLUESKY_POST_COLLECTION, rkey);
  } catch {
    // No twin to delete — fine.
  }
}

// ── Presence (which posts actually made it onto Bluesky) ────────────────────

/**
 * Given GainForest feed-post AT-URIs, ask the public Bluesky appview which of
 * their same-rkey twins exist, and return uri → bsky.app URL for the ones that
 * do. Batched (getPosts caps at 25 URIs per call); failures return an empty
 * map so links simply don't render. Only twins the relay actually indexed
 * count — a link should never point at a post bsky.app can't show.
 */
export async function fetchBlueskyPostLinks(uris: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const pairs = uris
    .map((uri) => ({ uri, parsed: parseAtUri(uri) }))
    .filter((p): p is { uri: string; parsed: { did: string; collection: string; rkey: string } } => p.parsed !== null);
  if (pairs.length === 0) return found;

  const byTwinUri = new Map<string, string>();
  for (const { uri, parsed } of pairs) {
    byTwinUri.set(`at://${parsed.did}/${BLUESKY_POST_COLLECTION}/${parsed.rkey}`, uri);
  }

  const twinUris = [...byTwinUri.keys()];
  for (let i = 0; i < twinUris.length; i += 25) {
    const batch = twinUris.slice(i, i + 25);
    const params = new URLSearchParams();
    for (const uri of batch) params.append("uris", uri);
    const res = await fetch(`${APPVIEW_BASE}/xrpc/app.bsky.feed.getPosts?${params.toString()}`, {
      headers: { accept: "application/json" },
    }).catch(() => null);
    if (!res?.ok) continue;
    const payload = (await res.json().catch(() => null)) as { posts?: Array<{ uri?: unknown }> } | null;
    for (const post of payload?.posts ?? []) {
      if (typeof post.uri !== "string") continue;
      const sourceUri = byTwinUri.get(post.uri);
      const parsed = parseAtUri(post.uri);
      if (sourceUri && parsed) found.set(sourceUri, blueskyPostUrl(parsed.did, parsed.rkey));
    }
  }
  return found;
}
