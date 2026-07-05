import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  RECOGNITION_BADGE_DESCRIPTIONS,
  RECOGNITION_BADGE_KEYS,
  isRecognitionBadgeKey,
  type RecognitionBadgeKey,
} from "@/app/_lib/recognition-badges";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeData,
  type BadgeAwardRecord,
  type StrongRef,
} from "./badge-records";

const RECOGNITION_BADGE_TYPE = "recognition";

export class RecognitionMutationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RecognitionMutationError";
    this.status = status;
  }
}

type CgsMutationResult = { uri?: string; cid?: string; error?: string; message?: string };

type CgsCreatePayload = { operation: "createRecord"; collection: string; record: Record<string, unknown> };
type CgsDeletePayload = { operation: "deleteRecord"; collection: string; rkey: string };

async function cgsMutate(
  repo: string,
  cookie: string | null,
  payload: CgsCreatePayload | CgsDeletePayload,
): Promise<CgsMutationResult> {
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ ...payload, repo }),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as CgsMutationResult | null;
  if (!upstream.ok || !data || data.error) {
    throw new RecognitionMutationError(
      data?.message ?? data?.error ?? "Could not update the badge.",
      upstream.status || 502,
    );
  }
  return data;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function findDefinition(
  definitions: { uri: string; cid: string; title: string }[],
  key: RecognitionBadgeKey,
): StrongRef | null {
  const match = definitions.find((definition) => normalizeTitle(definition.title) === key);
  return match ? { uri: match.uri, cid: match.cid } : null;
}

type RecognitionBadgeState = {
  key: RecognitionBadgeKey;
  awarded: boolean;
  /** Award records for this account+badge, for revocation. */
  awards: BadgeAwardRecord[];
};

/** Read every recognition badge's awarded state for one account. */
async function readRecognitionState(
  repoDid: string,
  subjectDid: string,
): Promise<Record<RecognitionBadgeKey, RecognitionBadgeState>> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  const result = {} as Record<RecognitionBadgeKey, RecognitionBadgeState>;
  for (const key of RECOGNITION_BADGE_KEYS) {
    const definition = findDefinition(data.definitions, key);
    const awards = definition
      ? data.awards.filter((award) => award.badge.uri === definition.uri && award.subjectDid === subjectDid)
      : [];
    result[key] = { key, awarded: awards.length > 0, awards };
  }
  return result;
}

/** Ensure a recognition badge definition exists, creating it on first award. */
async function ensureDefinition(repoDid: string, cookie: string | null, key: RecognitionBadgeKey): Promise<StrongRef> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: false });
  const existing = findDefinition(data.definitions, key);
  if (existing) return existing;

  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_DEFINITION_COLLECTION,
    record: {
      $type: BADGE_DEFINITION_COLLECTION,
      title: key,
      badgeType: RECOGNITION_BADGE_TYPE,
      description: RECOGNITION_BADGE_DESCRIPTIONS[key],
      createdAt: new Date().toISOString(),
    },
  });
  if (!created.uri || !created.cid) {
    throw new RecognitionMutationError("Could not create the badge.", 502);
  }
  return { uri: created.uri, cid: created.cid };
}

/** Award a recognition badge to an account (idempotent). */
export async function awardRecognition(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  key: string,
): Promise<void> {
  if (!isRecognitionBadgeKey(key)) throw new RecognitionMutationError("Unknown badge.", 400);
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  let definition = findDefinition(data.definitions, key);
  const alreadyAwarded = definition
    ? data.awards.some((award) => award.badge.uri === definition!.uri && award.subjectDid === subjectDid)
    : false;
  if (alreadyAwarded) return;
  definition = definition ?? (await ensureDefinition(repoDid, cookie, key));
  await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_AWARD_COLLECTION,
    record: {
      $type: BADGE_AWARD_COLLECTION,
      badge: { uri: definition.uri, cid: definition.cid },
      subject: { $type: "app.certified.defs#did", did: subjectDid },
      note: RECOGNITION_BADGE_DESCRIPTIONS[key],
      createdAt: new Date().toISOString(),
    },
  });
}

/** Revoke a recognition badge from an account (idempotent). Deletes every
 *  matching award; CGS may reject removing another steward's award. */
export async function revokeRecognition(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  key: string,
): Promise<void> {
  if (!isRecognitionBadgeKey(key)) throw new RecognitionMutationError("Unknown badge.", 400);
  const state = await readRecognitionState(repoDid, subjectDid);
  for (const award of state[key].awards) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: award.rkey,
    });
  }
}
