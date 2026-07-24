import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  FEED_PIN_COLLECTION,
  fetchFeedPinRecords,
  isFeedPostUri,
  type FeedPinRecord,
} from "@/app/_lib/feed-pins";
import { resolveStrongRef } from "@/app/_lib/pds";

export class FeedPinMutationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FeedPinMutationError";
    this.status = status;
  }
}

type CgsMutationResult = { uri?: string; cid?: string; error?: string; message?: string };

type CgsCreatePayload = {
  operation: "createRecord";
  collection: string;
  record: Record<string, unknown>;
};

type CgsDeletePayload = {
  operation: "deleteRecord";
  collection: string;
  rkey: string;
};

async function cgsMutate(
  repo: string,
  cookie: string | null,
  payload: CgsCreatePayload | CgsDeletePayload,
): Promise<CgsMutationResult> {
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...payload, repo }),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as CgsMutationResult | null;
  if (!upstream.ok || !data || data.error) {
    throw new FeedPinMutationError(
      data?.message ?? data?.error ?? "Could not update the pinned post.",
      upstream.status || 502,
    );
  }
  return data;
}

/** List the current pin records (newest first). */
export async function listFeedPins(repoDid: string): Promise<FeedPinRecord[]> {
  return fetchFeedPinRecords(repoDid).catch(() => []);
}

/**
 * Pin a feed post to the top of the activity feed. Only one post is pinned at
 * a time: any existing pin records are deleted before the new one is created.
 * The subject must be an `app.gainforest.feed.post` AT-URI; it is resolved to
 * a strongRef (uri + cid) from its owner's PDS, which also verifies the post
 * still exists.
 */
export async function pinFeedPost(repoDid: string, cookie: string | null, subjectUri: string): Promise<void> {
  const trimmed = subjectUri.trim();
  if (!trimmed || !isFeedPostUri(trimmed)) {
    throw new FeedPinMutationError("Only a feed post can be pinned.", 400);
  }

  const subject = await resolveStrongRef(trimmed).catch(() => null);
  if (!subject) {
    throw new FeedPinMutationError("We couldn't find that post. It may have been deleted.", 404);
  }

  // Single-pin semantics: replace any existing pin(s), then write the new one.
  const existing = await listFeedPins(repoDid);
  if (existing.some((pin) => pin.subjectUri === subject.uri) && existing.length === 1) return; // already pinned
  for (const pin of existing) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: FEED_PIN_COLLECTION,
      rkey: pin.rkey,
    });
  }

  await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: FEED_PIN_COLLECTION,
    record: {
      $type: FEED_PIN_COLLECTION,
      subject: { uri: subject.uri, cid: subject.cid },
      createdAt: new Date().toISOString(),
    },
  });
}

/**
 * Unpin a post (idempotent). When `subjectUri` is given, only pins for that
 * post are removed; otherwise every pin record is deleted.
 */
export async function unpinFeedPost(
  repoDid: string,
  cookie: string | null,
  subjectUri?: string | null,
): Promise<void> {
  const target = subjectUri?.trim() || null;
  const existing = await listFeedPins(repoDid);
  for (const pin of existing) {
    if (target && pin.subjectUri !== target) continue;
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: FEED_PIN_COLLECTION,
      rkey: pin.rkey,
    });
  }
}
