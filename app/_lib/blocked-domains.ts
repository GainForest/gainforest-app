/**
 * Blocked account addresses.
 *
 * Some accounts live on servers that only ever hold throwaway content — the
 * development server the team and the e2e suite create disposable
 * organizations on, for example. Their organizations, projects, observations
 * and posts are indexed exactly like real ones, so without a filter they show
 * up in the explorer, search, the globe, the feed and every public count.
 *
 * This module turns "block everything from this server address" into a set of
 * account DIDs the public surfaces can subtract:
 *
 *   1. The blocked addresses = built-in ones (from `NEXT_PUBLIC_BLOCKED_PDS_DOMAINS`,
 *      defaulting to the development server) plus any an admin added from the
 *      admin area, stored as append-only records in the moderation account.
 *   2. Each address is asked for the accounts it hosts
 *      (`com.atproto.sync.listRepos`), which is one cheap paginated call per
 *      address and needs no per-account identity lookups.
 *
 * Both steps fail open: a network hiccup must never blank the public catalogs.
 * Everything here is CORS-safe, so it runs in the browser (where most explorer
 * fetching happens) as well as on the server.
 */

import { cachedAsync, invalidateCachedAsyncByPrefix } from "./async-cache";
import { GAINFOREST_MODERATION_REPO_DID } from "./moderation-repo";
import { resolvePdsHost } from "./pds";

/** Append-only blocked-address events written to the moderation account. */
export const BLOCKED_DOMAIN_COLLECTION = "app.gainforest.moderation.blockedDomain";

const DOMAIN_RECORDS_CACHE_KEY = "blocked-domains:records:v1";
const DOMAIN_RECORDS_CACHE_MS = 60_000;

const BLOCKED_DIDS_CACHE_KEY = "blocked-domains:dids:v1";
/** Short enough that adding an address takes effect within minutes. */
const BLOCKED_DIDS_CACHE_MS = 5 * 60 * 1000;

/** Server address whose accounts are blocked out of the box. The development
 *  server is the one that exists in every deployment; set
 *  `NEXT_PUBLIC_BLOCKED_PDS_DOMAINS` to change it, or to an empty string to
 *  start with nothing blocked (the e2e suite does this, because its disposable
 *  accounts live on that very server). */
const DEFAULT_BLOCKED_DOMAINS = "dev.certified.app";

const EMPTY_DIDS: ReadonlySet<string> = new Set<string>();

export type BlockedDomainRecord = {
  rkey: string;
  uri: string;
  /** Normalized host, e.g. "dev.certified.app". */
  domain: string;
  /** False is an append-only unblock event created by another admin. */
  blocked: boolean;
  createdAt: string;
};

export type BlockedDomainAdminRow = BlockedDomainRecord & {
  /** How many accounts the address currently hosts. Null when unreachable. */
  accountCount: number | null;
};

type ListRecordsResponse = { records?: unknown[]; cursor?: unknown };
type ListReposResponse = { repos?: unknown[]; cursor?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Accept what an admin is likely to paste — "https://dev.certified.app/",
 * "DEV.Certified.App", "*.dev.certified.app", "@dev.certified.app" — and
 * return the bare lowercase host, or null when it isn't a usable address.
 */
export function normalizeBlockedDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  value = value.replace(/^@+/, "").replace(/^\*+\./, "");
  value = value.split("@").pop() ?? "";
  value = value.split(":")[0]!;
  value = value.replace(/^\.+/, "").replace(/\.+$/, "");
  if (!value) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return null;
  if (value.length > 253) return null;
  return value;
}

/** Addresses blocked in every environment, before any admin additions. */
export function builtinBlockedDomains(): string[] {
  const configured = process.env.NEXT_PUBLIC_BLOCKED_PDS_DOMAINS;
  const raw = configured === undefined ? DEFAULT_BLOCKED_DOMAINS : configured;
  const domains = new Set<string>();
  for (const entry of raw.split(/[\s,]+/)) {
    const domain = normalizeBlockedDomain(entry);
    if (domain) domains.add(domain);
  }
  return [...domains];
}

/** Parse one public PDS record, ignoring malformed or unrelated values. */
export function parseBlockedDomainRecord(entry: unknown): BlockedDomainRecord | null {
  if (!isRecord(entry)) return null;
  const uri = nonEmptyString(entry.uri);
  const value = entry.value;
  if (!uri || !isRecord(value)) return null;

  const domain = normalizeBlockedDomain(nonEmptyString(value.domain) ?? "");
  const createdAt = nonEmptyString(value.createdAt);
  if (!domain || !createdAt) return null;

  return {
    rkey: uri.split("/").pop() ?? "",
    uri,
    domain,
    // Records written before unblock events existed represent a block, so an
    // absent field stays backwards-compatible.
    blocked: typeof value.blocked === "boolean" ? value.blocked : true,
    createdAt,
  };
}

/** Read every blocked-address event directly from the moderation account's PDS. */
export async function fetchBlockedDomainRecords(
  repoDid: string,
  signal?: AbortSignal,
): Promise<BlockedDomainRecord[]> {
  const host = await resolvePdsHost(repoDid, signal);
  if (!host) throw new Error("Could not resolve the moderation account.");

  const records: BlockedDomainRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    if (page >= 100) throw new Error("The blocked address list exceeded its safe read limit.");
    const params = new URLSearchParams({
      repo: repoDid,
      collection: BLOCKED_DOMAIN_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { cache: "no-store", signal },
    );
    // An account that has never blocked an address has no such collection;
    // atproto answers 400 for an unknown collection on some PDS versions.
    if (response.status === 400) break;
    if (!response.ok) throw new Error(`Could not load blocked addresses (${response.status}).`);

    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    if (!payload || !Array.isArray(payload.records)) {
      throw new Error("The blocked address list returned an invalid response.");
    }
    for (const entry of payload.records) {
      const record = parseBlockedDomainRecord(entry);
      if (record) records.push(record);
    }
    cursor = nonEmptyString(payload.cursor) ?? undefined;
    if (!cursor) break;
  }

  return records.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
}

/**
 * Resolve the append-only event stream to one current state per address. The
 * newest event wins, so any admin can unblock an address another admin blocked
 * without deleting their record.
 */
export function effectiveBlockedDomainRecords(
  records: readonly BlockedDomainRecord[],
): BlockedDomainRecord[] {
  const newestFirst = [...records].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.uri.localeCompare(a.uri),
  );
  const seen = new Set<string>();
  const active: BlockedDomainRecord[] = [];
  for (const record of newestFirst) {
    if (seen.has(record.domain)) continue;
    seen.add(record.domain);
    if (record.blocked) active.push(record);
  }
  return active;
}

/**
 * Resolve any historical/stale event rkey to the address it names, then return
 * that address's current active block. Prevents a stale admin view from
 * reporting a successful unblock while a concurrent block wins.
 */
export function resolveActiveBlockedDomain(
  records: readonly BlockedDomainRecord[],
  rkey: string,
): BlockedDomainRecord | null {
  const requested = records.find((record) => record.rkey === rkey);
  if (!requested) return null;
  return (
    effectiveBlockedDomainRecords(records).find((record) => record.domain === requested.domain) ??
    null
  );
}

/** Briefly cached read of the admin-managed events. Empty on any error. */
function fetchBlockedDomainRecordsCached(signal?: AbortSignal): Promise<BlockedDomainRecord[]> {
  return cachedAsync(
    DOMAIN_RECORDS_CACHE_KEY,
    DOMAIN_RECORDS_CACHE_MS,
    () => fetchBlockedDomainRecords(GAINFOREST_MODERATION_REPO_DID).catch(() => []),
    signal,
  );
}

/** Every currently blocked address: built-ins plus admin additions. */
export async function fetchBlockedDomains(signal?: AbortSignal): Promise<string[]> {
  const records = await fetchBlockedDomainRecordsCached(signal).catch(() => []);
  const domains = new Set(builtinBlockedDomains());
  for (const record of effectiveBlockedDomainRecords(records)) domains.add(record.domain);
  return [...domains];
}

export function invalidateBlockedDomainsCache(): void {
  invalidateCachedAsyncByPrefix(DOMAIN_RECORDS_CACHE_KEY);
  invalidateCachedAsyncByPrefix(BLOCKED_DIDS_CACHE_KEY);
}

/**
 * Every account DID one server hosts, via `com.atproto.sync.listRepos`. Throws
 * on failure so the caller can decide whether to fail open.
 */
export async function fetchDomainAccountDids(
  domain: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const dids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    // 50 pages x 1000 repos is far beyond any server we block; the ceiling
    // only exists so a broken cursor can't spin forever.
    if (page >= 50) break;
    const params = new URLSearchParams({ limit: "1000" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(
      `https://${domain}/xrpc/com.atproto.sync.listRepos?${params.toString()}`,
      { cache: "no-store", signal },
    );
    if (!response.ok) throw new Error(`Could not list accounts on ${domain} (${response.status}).`);
    const payload = (await response.json().catch(() => null)) as ListReposResponse | null;
    if (!payload || !Array.isArray(payload.repos)) {
      throw new Error(`${domain} returned an invalid account list.`);
    }
    for (const entry of payload.repos) {
      const did = isRecord(entry) ? nonEmptyString(entry.did) : null;
      if (did?.startsWith("did:")) dids.add(did);
    }
    cursor = nonEmptyString(payload.cursor) ?? undefined;
    if (!cursor || payload.repos.length === 0) break;
  }
  return dids;
}

async function fetchBlockedDomainDidsUncached(): Promise<Set<string>> {
  const domains = await fetchBlockedDomains().catch(() => builtinBlockedDomains());
  if (domains.length === 0) return new Set<string>();

  const perDomain = await Promise.all(
    // One unreachable server must not drop the accounts blocked by another.
    domains.map((domain) => fetchDomainAccountDids(domain).catch(() => new Set<string>())),
  );
  const dids = new Set<string>();
  for (const set of perDomain) for (const did of set) dids.add(did);
  return dids;
}

/**
 * Every account DID hosted on a blocked address. Public surfaces subtract this
 * set the same way they subtract accounts an admin flagged as test accounts.
 * Empty on any error, so a transient outage never hides the real catalog.
 */
export function fetchBlockedDomainDids(signal?: AbortSignal): Promise<ReadonlySet<string>> {
  return cachedAsync(
    BLOCKED_DIDS_CACHE_KEY,
    BLOCKED_DIDS_CACHE_MS,
    () => fetchBlockedDomainDidsUncached().catch(() => new Set<string>()),
    signal,
  ).catch(() => EMPTY_DIDS);
}
