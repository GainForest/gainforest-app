import "server-only";

import { fetchAccountCards, indexerQuery, type AccountCard } from "@/app/_lib/indexer";
import { resolveBlobUrl } from "@/app/_lib/pds";
import {
  LEGACY_WALLET_COLLECTION,
  PRIMARY_WALLET_COLLECTION,
} from "@/lib/splits-vault/shared";

/**
 * Admin statistics — "Wallets created": every account that has created a
 * donation wallet in the app, with the total count.
 *
 * Unlike the search-first "Wallet connections" view (which reads individual
 * repos on demand), this CAN enumerate everything cheaply: the indexer keeps a
 * generic per-collection record index, so one query per collection returns all
 * wallet records without touching any PDS repo. Both the current collection
 * (`app.gainforest.wallet.primary`) and the legacy one it superseded
 * (`app.gainforest.wallet.splitsVault`) are counted; an account that still has
 * both (migrated on write, legacy left behind) is counted once.
 */

export type WalletStatRow = {
  did: string;
  kind: "person" | "org";
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Vault address as recorded; null when the record is malformed. */
  address: string | null;
  /** Wallet nickname, when the creator gave it one. */
  walletName: string | null;
  /** ISO timestamp from the record; null when missing/malformed. */
  createdAt: string | null;
  signerCount: number | null;
  /** True when only the legacy-collection record exists for this account. */
  legacy: boolean;
};

export type WalletStats = {
  /** Unique accounts with a wallet record, newest first. */
  rows: WalletStatRow[];
};

// ── Indexer reads ────────────────────────────────────────────────────────────

const GENERIC_RECORDS_QUERY = `
  query AdminWalletRecords($collection: String!, $first: Int!, $after: String) {
    records(collection: $collection, first: $first, after: $after) {
      edges {
        node {
          uri
          did
          value
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PAGE_SIZE = 1000;
/** Wallet records number in the dozens today; this only bounds a runaway loop. */
const MAX_PAGES = 20;

export type RawWalletRecord = {
  did: string;
  value: unknown;
};

type GenericRecordsPayload = {
  records?: {
    edges?: Array<{
      node?: { uri?: string | null; did?: string | null; value?: unknown } | null;
    } | null> | null;
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  } | null;
};

/** Pull the DID out of an `at://did/collection/rkey` record URI. */
function didFromUri(uri: string | null | undefined): string | null {
  if (typeof uri !== "string") return null;
  const did = uri.replace(/^at:\/\//, "").split("/")[0];
  return did.startsWith("did:") ? did : null;
}

async function fetchAllWalletRecords(collection: string, signal?: AbortSignal): Promise<RawWalletRecord[]> {
  const out: RawWalletRecord[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: GenericRecordsPayload | null = await indexerQuery<GenericRecordsPayload>(
      GENERIC_RECORDS_QUERY,
      { collection, first: PAGE_SIZE, after },
      signal,
    );
    const connection: GenericRecordsPayload["records"] = data?.records;
    if (!connection) break;
    for (const edge of connection.edges ?? []) {
      const node = edge?.node;
      // The prod indexer's GenericRecord exposes `did` at the top level (there is
      // no `author` subfield); fall back to parsing it out of the record URI.
      const did = node?.did ?? didFromUri(node?.uri);
      if (typeof did !== "string" || !did.startsWith("did:")) continue;
      out.push({ did, value: node?.value });
    }
    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }
  return out;
}

// ── Pure assembly (unit-tested) ──────────────────────────────────────────────

type ParsedWalletValue = {
  address: string | null;
  walletName: string | null;
  createdAt: string | null;
  signerCount: number | null;
};

/**
 * Read the fields the stat shows out of a raw record value, tolerating
 * malformed records: an account still counts as "has created a wallet" even
 * when a field is missing, so each field degrades to null independently.
 */
function parseWalletValue(value: unknown): ParsedWalletValue {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const address =
    typeof record.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(record.address) ? record.address : null;
  const walletName = typeof record.name === "string" && record.name.trim() ? record.name.trim() : null;
  const createdAt =
    typeof record.createdAt === "string" && !Number.isNaN(Date.parse(record.createdAt))
      ? record.createdAt
      : null;
  const signerCount = Array.isArray(record.signers) ? record.signers.length : null;
  return { address, walletName, createdAt, signerCount };
}

/**
 * Merge the two collections into one row per account. A primary record always
 * wins over a legacy one for the same DID (legacy records are left behind by
 * migration); within a collection the indexer serves one record per account
 * (fixed rkey), so later duplicates are ignored. Newest wallet first;
 * undatable records sink to the end.
 */
export function buildWalletStatRows(
  primary: RawWalletRecord[],
  legacy: RawWalletRecord[],
): Array<Omit<WalletStatRow, "kind" | "handle" | "displayName" | "avatarUrl">> {
  const byDid = new Map<string, Omit<WalletStatRow, "kind" | "handle" | "displayName" | "avatarUrl">>();
  for (const { records, isLegacy } of [
    { records: primary, isLegacy: false },
    { records: legacy, isLegacy: true },
  ]) {
    for (const record of records) {
      if (byDid.has(record.did)) continue;
      byDid.set(record.did, { did: record.did, ...parseWalletValue(record.value), legacy: isLegacy });
    }
  }
  return [...byDid.values()].sort((a, b) => {
    if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return a.did.localeCompare(b.did);
  });
}

// ── Loader ───────────────────────────────────────────────────────────────────

/** Load the "wallets created" statistic: one row per account, newest first. */
export async function loadWalletStats(signal?: AbortSignal): Promise<WalletStats> {
  const [primary, legacy] = await Promise.all([
    fetchAllWalletRecords(PRIMARY_WALLET_COLLECTION, signal),
    fetchAllWalletRecords(LEGACY_WALLET_COLLECTION, signal),
  ]);
  const bare = buildWalletStatRows(primary, legacy);

  const dids = bare.map((row) => row.did);
  const cards = await fetchAccountCards(dids, signal).catch(() => new Map<string, AccountCard>());
  const rows = await Promise.all(
    bare.map(async (row): Promise<WalletStatRow> => {
      const card = cards.get(row.did);
      const avatarUrl = card?.avatarRef
        ? await resolveBlobUrl(row.did, card.avatarRef, signal).catch(() => null)
        : null;
      return {
        ...row,
        kind: card?.isOrganization ? "org" : "person",
        handle: card?.handle ?? null,
        displayName: card?.displayName ?? null,
        avatarUrl,
      };
    }),
  );
  return { rows };
}
