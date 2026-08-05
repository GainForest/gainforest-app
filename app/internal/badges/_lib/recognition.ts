import "server-only";
import { createHash } from "node:crypto";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import {
  isRecognitionBadgeKey,
  parseRecognitionBadgeKey,
  recognitionBadgeDescription,
  type RecognitionBadgeKey,
} from "@/app/_lib/recognition-badges";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeDataStrict,
  type BadgeAwardRecord,
  type StrictInternalBadgeData,
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

type CgsCreatePayload = {
  operation: "createRecord";
  collection: string;
  rkey?: string;
  record: Record<string, unknown>;
};
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

function canonicalKey(key: string): RecognitionBadgeKey {
  return normalizeTitle(key);
}

function findDefinition(
  definitions: { uri: string; cid: string; title: string }[],
  key: RecognitionBadgeKey,
): StrongRef | null {
  const match = definitions.find((definition) => normalizeTitle(definition.title) === key);
  return match ? { uri: match.uri, cid: match.cid } : null;
}

function matchingAwards(data: Pick<StrictInternalBadgeData, "definitions" | "awards">, key: RecognitionBadgeKey): BadgeAwardRecord[] {
  const definitionUris = new Set(
    data.definitions
      .filter((definition) => normalizeTitle(definition.title) === key)
      .map((definition) => definition.uri),
  );
  return data.awards.filter((award) => definitionUris.has(award.badge.uri));
}

function isSingleWinnerPrize(key: RecognitionBadgeKey): boolean {
  const parsed = parseRecognitionBadgeKey(key);
  return parsed?.family === "bioblitz" && parsed.roundId !== null;
}

function definitionRkey(key: RecognitionBadgeKey): string {
  return `recognition-definition-${key}`;
}

function awardRkey(key: RecognitionBadgeKey, subjectDid: string): string {
  // Each BioBlitz round/prize has exactly one recipient. A fixed record key
  // makes the group's PDS enforce that claim atomically under concurrent posts.
  if (isSingleWinnerPrize(key)) return `recognition-award-${key}`;
  const recipientHash = createHash("sha256").update(subjectDid).digest("hex").slice(0, 24);
  return `recognition-award-${key}-${recipientHash}`;
}

function assertAwardCanBeCreated(
  data: Pick<StrictInternalBadgeData, "definitions" | "awards">,
  key: RecognitionBadgeKey,
  subjectDid: string,
): boolean {
  const awards = matchingAwards(data, key);
  if (awards.some((award) => award.subjectDid === subjectDid)) return false;
  if (isSingleWinnerPrize(key) && awards.length > 0) {
    throw new RecognitionMutationError("This BioBlitz prize was already awarded to another account.", 409);
  }
  return true;
}

/** Award records held by `subjectDid` for one badge key, for revocation. */
async function readBadgeAwards(
  repoDid: string,
  subjectDid: string,
  key: RecognitionBadgeKey,
): Promise<BadgeAwardRecord[]> {
  const data = await fetchInternalBadgeDataStrict(repoDid, { includeAwards: true });
  return matchingAwards(data, key).filter((award) => award.subjectDid === subjectDid);
}

/** Ensure a recognition badge definition exists, creating it on first award. */
async function ensureDefinition(repoDid: string, cookie: string | null, key: RecognitionBadgeKey): Promise<StrongRef> {
  const data = await fetchInternalBadgeDataStrict(repoDid, { includeAwards: false });
  const existing = findDefinition(data.definitions, key);
  if (existing) return existing;

  try {
    const created = await cgsMutate(repoDid, cookie, {
      operation: "createRecord",
      collection: BADGE_DEFINITION_COLLECTION,
      rkey: definitionRkey(key),
      record: {
        $type: BADGE_DEFINITION_COLLECTION,
        title: key,
        badgeType: RECOGNITION_BADGE_TYPE,
        description: recognitionBadgeDescription(key),
        createdAt: new Date().toISOString(),
      },
    });
    if (!created.uri || !created.cid) {
      throw new RecognitionMutationError("Could not create the badge.", 502);
    }
    return { uri: created.uri, cid: created.cid };
  } catch (error) {
    // A deterministic rkey can lose a concurrent create. Re-read the PDS and
    // accept only the definition that is now durably present.
    const after = await fetchInternalBadgeDataStrict(repoDid, { includeAwards: false });
    const recovered = findDefinition(after.definitions, key);
    if (recovered) return recovered;
    throw error;
  }
}

/** Award a recognition badge to an account (idempotent). The optional note
 *  and link preserve the steward's decision alongside the public award. */
export async function awardRecognition(
  repoDid: string,
  cookie: string | null,
  subjectDid: string,
  key: string,
  note?: string,
  url?: string,
): Promise<void> {
  if (!isRecognitionBadgeKey(key)) throw new RecognitionMutationError("Unknown badge.", 400);
  const normalizedKey = canonicalKey(key);
  const parsedKey = parseRecognitionBadgeKey(normalizedKey);
  if (parsedKey?.family === "bioblitz" && parsedKey.roundId === null) {
    throw new RecognitionMutationError("Unknown badge.", 400);
  }

  let data = await fetchInternalBadgeDataStrict(repoDid, { includeAwards: true });
  if (!assertAwardCanBeCreated(data, normalizedKey, subjectDid)) return;
  const definition = findDefinition(data.definitions, normalizedKey)
    ?? await ensureDefinition(repoDid, cookie, normalizedKey);

  // Read directly from the group's PDS after definition creation, so a stale
  // indexer or failed list request can never be interpreted as an empty award.
  data = await fetchInternalBadgeDataStrict(repoDid, { includeAwards: true });
  if (!assertAwardCanBeCreated(data, normalizedKey, subjectDid)) return;

  try {
    await cgsMutate(repoDid, cookie, {
      operation: "createRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: awardRkey(normalizedKey, subjectDid),
      record: {
        $type: BADGE_AWARD_COLLECTION,
        badge: { uri: definition.uri, cid: definition.cid },
        subject: { $type: "app.certified.defs#did", did: subjectDid },
        note: note ?? recognitionBadgeDescription(normalizedKey),
        ...(url ? { url } : {}),
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    // If another moderator won the atomic rkey claim first, recover only when
    // it awarded this same account; otherwise surface the conflicting award.
    const after = await fetchInternalBadgeDataStrict(repoDid, { includeAwards: true });
    if (!assertAwardCanBeCreated(after, normalizedKey, subjectDid)) return;
    throw error;
  }
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
  const awards = await readBadgeAwards(repoDid, subjectDid, canonicalKey(key));
  for (const award of awards) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: award.rkey,
    });
  }
}
