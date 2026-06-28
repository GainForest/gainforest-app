import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { TEST_ACCOUNT_BADGE_TITLE } from "@/app/_lib/indexer";
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

export type TestAccountState = {
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
export async function readTestAccountState(repoDid: string, subjectDid: string): Promise<TestAccountState> {
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
