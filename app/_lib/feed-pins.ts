import { cachedAsync } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./indexer";
import { parseAtUri, resolvePdsHost } from "./pds";

/**
 * The admin-managed "pinned post" for the activity feed: a steward in the
 * GainForest admin group can pin one feed post to the top of /feed.
 *
 * Each pin is one `app.gainforest.feed.pin` record in the moderation group's
 * repo. Records are written through the group service (CGS) and read back
 * directly with `com.atproto.repo.listRecords` — the GraphQL index doesn't
 * know this custom collection, and listRecords is a public, CORS-open read.
 * The newest pin wins; unpinning deletes the record(s).
 */
export const FEED_PIN_COLLECTION = "app.gainforest.feed.pin";

/** Collection a pin subject must belong to (only feed posts can be pinned). */
export const FEED_POST_COLLECTION = "app.gainforest.feed.post";

const PIN_CACHE_MS = 30_000;

export type FeedPinRecord = {
  rkey: string;
  uri: string;
  /** AT-URI of the pinned `app.gainforest.feed.post`. */
  subjectUri: string;
  createdAt: string | null;
};

type ListedRecord = { uri?: unknown; value?: unknown };
type ListRecordsResponse = { records?: ListedRecord[]; cursor?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** True when `uri` is an AT-URI pointing at a feed post record. */
export function isFeedPostUri(uri: string): boolean {
  const parts = parseAtUri(uri);
  return Boolean(parts && parts.collection === FEED_POST_COLLECTION);
}

/** Read every feed-pin record from the given repo (newest first). */
export async function fetchFeedPinRecords(repoDid: string, signal?: AbortSignal): Promise<FeedPinRecord[]> {
  const host = await resolvePdsHost(repoDid, signal).catch(() => null);
  if (!host) return [];

  const records: FeedPinRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ repo: repoDid, collection: FEED_PIN_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      cache: "no-store",
      signal,
    }).catch(() => null);
    if (!response?.ok) break;
    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    for (const entry of payload?.records ?? []) {
      const uri = str(entry.uri);
      const value = entry.value;
      if (!uri || !isRecord(value)) continue;
      const subject = value.subject;
      const subjectUri = isRecord(subject) ? str(subject.uri) : null;
      if (!subjectUri || !isFeedPostUri(subjectUri)) continue;
      records.push({
        rkey: uri.split("/").pop() ?? "",
        uri,
        subjectUri,
        createdAt: str(value.createdAt),
      });
    }
    cursor = str(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }

  return records.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/**
 * AT-URIs of the currently pinned feed post(s) in the moderation repo, newest
 * pin first and de-duplicated. The feed prepends these to its first page.
 * Cached briefly in-process; failure is soft (no pins → normal feed).
 */
export function fetchPinnedPostUris(signal?: AbortSignal): Promise<string[]> {
  return cachedAsync(
    "feed-pinned-post-uris:v1",
    PIN_CACHE_MS,
    async () => {
      const records = await fetchFeedPinRecords(GAINFOREST_MODERATION_REPO_DID).catch(() => []);
      return [...new Set(records.map((record) => record.subjectUri))];
    },
    signal,
  );
}
