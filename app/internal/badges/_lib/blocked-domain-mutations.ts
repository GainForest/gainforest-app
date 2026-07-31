import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  BLOCKED_DOMAIN_COLLECTION,
  builtinBlockedDomains,
  effectiveBlockedDomainRecords,
  fetchBlockedDomainRecords,
  fetchDomainAccountDids,
  invalidateBlockedDomainsCache,
  normalizeBlockedDomain,
  resolveActiveBlockedDomain,
  type BlockedDomainAdminRow,
  type BlockedDomainRecord,
} from "@/app/_lib/blocked-domains";
import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/moderation-repo";

export type BlockedDomainMutationErrorCode =
  | "invalid_request"
  | "invalid_domain"
  | "builtin_domain"
  | "save_failed"
  | "delete_failed";

export class BlockedDomainMutationError extends Error {
  status: number;
  code: BlockedDomainMutationErrorCode;

  constructor(code: BlockedDomainMutationErrorCode, status: number) {
    super(code);
    this.name = "BlockedDomainMutationError";
    this.status = status;
    this.code = code;
  }
}

type CgsMutationResult = { uri?: string; error?: string; message?: string };
type CgsPayload = {
  operation: "createRecord";
  collection: string;
  record: Record<string, unknown>;
};

async function cgsMutate(
  repo: string,
  cookie: string | null,
  payload: CgsPayload,
  failureCode: "save_failed" | "delete_failed" = "save_failed",
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
    throw new BlockedDomainMutationError(failureCode, upstream.status || 502);
  }
  return data;
}

/** Attach the live account count so an admin can see what an address covers.
 *  Null when the server didn't answer — the block still applies. */
async function enrichRows(records: BlockedDomainRecord[]): Promise<BlockedDomainAdminRow[]> {
  const unique = effectiveBlockedDomainRecords(records);
  const counts = await Promise.all(
    unique.map((record) =>
      fetchDomainAccountDids(record.domain)
        .then((dids) => dids.size)
        .catch(() => null),
    ),
  );
  return unique
    .map((record, index) => ({ ...record, accountCount: counts[index] ?? null }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Admin rows for every address an admin blocked (built-ins are separate). */
export async function fetchBlockedDomainRows(): Promise<BlockedDomainAdminRow[]> {
  const records = await fetchBlockedDomainRecords(GAINFOREST_MODERATION_REPO_DID);
  return enrichRows(records);
}

/** Built-in addresses, with their live account counts, shown read-only. */
export async function fetchBuiltinBlockedDomainRows(): Promise<
  Array<{ domain: string; accountCount: number | null }>
> {
  const domains = builtinBlockedDomains();
  const counts = await Promise.all(
    domains.map((domain) =>
      fetchDomainAccountDids(domain)
        .then((dids) => dids.size)
        .catch(() => null),
    ),
  );
  return domains.map((domain, index) => ({ domain, accountCount: counts[index] ?? null }));
}

/** Block one server address. Idempotent: re-blocking returns the active row. */
export async function addBlockedDomain(
  repoDid: string,
  cookie: string | null,
  input: string,
): Promise<BlockedDomainAdminRow> {
  if (typeof input !== "string" || !input.trim()) {
    throw new BlockedDomainMutationError("invalid_request", 400);
  }
  const domain = normalizeBlockedDomain(input);
  if (!domain) throw new BlockedDomainMutationError("invalid_domain", 400);
  if (builtinBlockedDomains().includes(domain)) {
    throw new BlockedDomainMutationError("builtin_domain", 409);
  }

  const existing = await fetchBlockedDomainRecords(repoDid).catch(() => []);
  const active = effectiveBlockedDomainRecords(existing).find((record) => record.domain === domain);
  if (active) return (await enrichRows([active]))[0]!;

  const createdAt = new Date().toISOString();
  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BLOCKED_DOMAIN_COLLECTION,
    record: {
      $type: BLOCKED_DOMAIN_COLLECTION,
      domain,
      blocked: true,
      createdAt,
    },
  });
  if (!created.uri) throw new BlockedDomainMutationError("save_failed", 502);

  invalidateBlockedDomainsCache();
  const record: BlockedDomainRecord = {
    rkey: created.uri.split("/").pop() ?? "",
    uri: created.uri,
    domain,
    blocked: true,
    createdAt,
  };
  return (await enrichRows([record]))[0]!;
}

/**
 * Unblock an address. This appends an unblock event instead of deleting the
 * original record, so any admin can reverse a block another admin created
 * while the history stays intact.
 */
export async function removeBlockedDomain(
  repoDid: string,
  cookie: string | null,
  rkey: string,
): Promise<void> {
  const trimmed = typeof rkey === "string" ? rkey.trim() : "";
  if (!trimmed) throw new BlockedDomainMutationError("invalid_request", 400);

  const records = await fetchBlockedDomainRecords(repoDid);
  const target = resolveActiveBlockedDomain(records, trimmed);
  if (!target) return;

  await cgsMutate(
    repoDid,
    cookie,
    {
      operation: "createRecord",
      collection: BLOCKED_DOMAIN_COLLECTION,
      record: {
        $type: BLOCKED_DOMAIN_COLLECTION,
        domain: target.domain,
        blocked: false,
        createdAt: new Date().toISOString(),
      },
    },
    "delete_failed",
  );
  invalidateBlockedDomainsCache();
}
