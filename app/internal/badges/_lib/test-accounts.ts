import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { fetchHiddenAccountDids, TEST_ACCOUNT_BADGE_TITLE } from "@/app/_lib/indexer";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeData,
  type BadgeAwardRecord,
  type StrongRef,
} from "./badge-records";

const TEST_BADGE_DESCRIPTION =
  "Marks an account as a test account. Its records are hidden from the public projects, observations, and feed.";
const TEST_AWARD_NOTE = "Flagged as a test account; records are hidden from the public surfaces.";

export class TestAccountMutationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TestAccountMutationError";
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
    throw new TestAccountMutationError(
      data?.message ?? data?.error ?? "Could not update the test-account flag.",
      upstream.status || 502,
    );
  }
  return data;
}

type TestAccountState = {
  flagged: boolean;
  definition: StrongRef | null;
  awards: BadgeAwardRecord[];
};

function findTestDefinition(definitions: { uri: string; cid: string; title: string }[]): StrongRef | null {
  const match = definitions.find((definition) => definition.title.trim().toLowerCase() === TEST_ACCOUNT_BADGE_TITLE);
  return match ? { uri: match.uri, cid: match.cid } : null;
}

/** Read whether an account is currently flagged as a test account, along with
 *  the matching award records (for revocation). */
async function readTestAccountState(repoDid: string, subjectDid: string): Promise<TestAccountState> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  const definition = findTestDefinition(data.definitions);
  if (!definition) return { flagged: false, definition: null, awards: [] };
  const awards = data.awards.filter(
    (award) => award.badge.uri === definition.uri && award.subjectDid === subjectDid,
  );
  return { flagged: awards.length > 0, definition, awards };
}

/** Ensure the `test-account` badge definition exists in the group repo, lazily
 *  creating it the first time an account is flagged. */
async function ensureTestDefinition(repoDid: string, cookie: string | null): Promise<StrongRef> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: false });
  const existing = findTestDefinition(data.definitions);
  if (existing) return existing;

  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_DEFINITION_COLLECTION,
    record: {
      $type: BADGE_DEFINITION_COLLECTION,
      title: TEST_ACCOUNT_BADGE_TITLE,
      badgeType: "system",
      description: TEST_BADGE_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });
  if (!created.uri || !created.cid) {
    throw new TestAccountMutationError("Could not create the test-account badge.", 502);
  }
  return { uri: created.uri, cid: created.cid };
}

/** Flag an account as a test account (idempotent). */
export async function flagTestAccount(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
): Promise<void> {
  const state = await readTestAccountState(repoDid, subjectDid);
  if (state.flagged) return;
  const definition = state.definition ?? (await ensureTestDefinition(repoDid, cookie));
  await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_AWARD_COLLECTION,
    record: {
      $type: BADGE_AWARD_COLLECTION,
      badge: { uri: definition.uri, cid: definition.cid },
      subject: { $type: "app.certified.defs#did", did: subjectDid },
      note: TEST_AWARD_NOTE,
      createdAt: new Date().toISOString(),
    },
  });
}

export type FlaggedTestAccount = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** The accounts currently flagged as test accounts, resolved to a display name
 *  + avatar for the admin list view. Sorted by name (then DID) for stable
 *  ordering. */
export async function fetchFlaggedTestAccounts(): Promise<FlaggedTestAccount[]> {
  const dids = await fetchHiddenAccountDids().catch(() => new Set<string>());
  const accounts = await Promise.all(
    [...dids].map(async (did): Promise<FlaggedTestAccount> => {
      const card = await getCertifiedProfileCard(did).catch(() => null);
      return { did, displayName: card?.displayName?.trim() || null, avatarUrl: card?.avatarUrl ?? null };
    }),
  );
  return accounts.sort((a, b) =>
    (a.displayName ?? a.did).localeCompare(b.displayName ?? b.did, undefined, { sensitivity: "base" }),
  );
}

/** Remove the test-account flag from an account (idempotent). Deletes every
 *  matching award; a plain member can only remove flags they created, so the
 *  CGS layer may reject removing another steward's flag. */
export async function unflagTestAccount(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
): Promise<void> {
  const state = await readTestAccountState(repoDid, subjectDid);
  for (const award of state.awards) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: award.rkey,
    });
  }
}
