import { resolvePdsHost } from "./pds";

/**
 * The admin-managed "endorser" allow-list: organizations whose
 * `app.certified.badge.award` records we listen to as "Trusted by" signals.
 *
 * Each endorser is one record in the moderation group's repo. Records are
 * written through the group service (CGS) and read back directly with
 * `com.atproto.repo.listRecords` — the GraphQL index doesn't know this custom
 * collection, and listRecords is CORS-open so this read is safe from the
 * browser (the whole indexer runs client-side).
 */
export const ENDORSER_COLLECTION = "app.gainforest.endorser";

/** The two endorsers that ship built in (with bundled logos). They can't be
 *  removed from the admin panel — they're shown there read-only for context so
 *  the whole allow-list is visible in one place. Keep these DIDs in sync with
 *  `BUILTIN_TRUSTED_ISSUERS` in `indexer.ts`. */
export type BuiltinEndorser = { did: string; handle: string; label: string };
export const BUILTIN_ENDORSERS: BuiltinEndorser[] = [
  { did: "did:plc:yjck2sybksyigp3zvbq7bfki", handle: "gainforest.certified.one", label: "GainForest" },
  { did: "did:plc:2pfslyh6q2lk46xqwshjd6sc", handle: "biome-trust.certified.one", label: "Biome Trust" },
];

export type EndorserRecord = {
  rkey: string;
  uri: string;
  /** DID of the endorsing organization whose awards we trust. */
  subjectDid: string;
  /** Resolved handle at add-time, for linking to the endorser's account. */
  handle: string | null;
  /** Display name for the "Trusted by" emblem and the admin list. */
  label: string;
  note: string | null;
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

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** Read every endorser record from the given repo (newest first). */
export async function fetchEndorserRecords(repoDid: string, signal?: AbortSignal): Promise<EndorserRecord[]> {
  const host = await resolvePdsHost(repoDid, signal).catch(() => null);
  if (!host) return [];

  const records: EndorserRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ repo: repoDid, collection: ENDORSER_COLLECTION, limit: "100" });
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
      const subjectDid = str(value.subject);
      if (!subjectDid?.startsWith("did:")) continue;
      records.push({
        rkey: rkeyFromUri(uri),
        uri,
        subjectDid,
        handle: str(value.handle),
        label: str(value.label) ?? str(value.handle) ?? subjectDid,
        note: str(value.note),
        createdAt: str(value.createdAt),
      });
    }
    cursor = str(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }

  return records.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
