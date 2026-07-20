import "server-only";
import { TEST_RECORD_BADGE_TITLE } from "@/app/_lib/indexer";
import { resolvePdsHost } from "@/app/_lib/pds";
import { accountHref, localBumicertHref, localObservationHref, localProjectHref } from "@/app/_lib/urls";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import {
  BADGE_AWARD_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
  fetchInternalBadgeData,
  type BadgeAwardRecord,
  type StrongRef,
} from "./badge-records";
import { TestAccountMutationError, cgsMutate } from "./test-accounts";

const TEST_RECORD_BADGE_DESCRIPTION =
  "Marks a single record (a feed post, an observation, a project, …) as a test record. It is hidden from the public feed and catalogs without hiding the whole account.";
const TEST_RECORD_AWARD_NOTE = "Flagged as a test record; hidden from the public surfaces.";

/** Parse `at://did/collection/rkey` into its parts. */
function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}

/** Whether a string is a well-formed record AT-URI we can flag. */
export function isFlaggableRecordUri(uri: string): boolean {
  const parsed = parseAtUri(uri);
  return Boolean(parsed && parsed.did.startsWith("did:"));
}

/** Look up the current CID of a record on its owner's PDS, needed to build the
 *  StrongRef award subject. */
async function fetchRecordCid(uri: string): Promise<string> {
  const parsed = parseAtUri(uri);
  if (!parsed) throw new TestAccountMutationError("A valid record link is required.", 400);
  const host = await resolvePdsHost(parsed.did).catch(() => null);
  if (!host) throw new TestAccountMutationError("Could not find where this record is stored.", 502);
  const params = new URLSearchParams({ repo: parsed.did, collection: parsed.collection, rkey: parsed.rkey });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { cid?: unknown } | null;
  const cid = typeof payload?.cid === "string" && payload.cid.trim() ? payload.cid.trim() : null;
  if (!response.ok || !cid) {
    throw new TestAccountMutationError("Could not load this record to flag it.", response.ok ? 502 : response.status);
  }
  return cid;
}

type TestRecordState = {
  flagged: boolean;
  definition: StrongRef | null;
  awards: BadgeAwardRecord[];
};

function findTestRecordDefinition(definitions: { uri: string; cid: string; title: string }[]): StrongRef | null {
  const match = definitions.find((definition) => definition.title.trim().toLowerCase() === TEST_RECORD_BADGE_TITLE);
  return match ? { uri: match.uri, cid: match.cid } : null;
}

/** Read whether a record is currently flagged as a test record, along with the
 *  matching award records (for revocation). */
async function readTestRecordState(repoDid: string, subjectUri: string): Promise<TestRecordState> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true });
  const definition = findTestRecordDefinition(data.definitions);
  if (!definition) return { flagged: false, definition: null, awards: [] };
  const awards = data.awards.filter(
    (award) => award.badge.uri === definition.uri && award.subjectKind === "record" && award.subjectLabel === subjectUri,
  );
  return { flagged: awards.length > 0, definition, awards };
}

/** Ensure the `test-record` badge definition exists in the group repo, lazily
 *  creating it the first time a record is flagged. */
async function ensureTestRecordDefinition(repoDid: string, cookie: string | null): Promise<StrongRef> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: false });
  const existing = findTestRecordDefinition(data.definitions);
  if (existing) return existing;

  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_DEFINITION_COLLECTION,
    record: {
      $type: BADGE_DEFINITION_COLLECTION,
      title: TEST_RECORD_BADGE_TITLE,
      badgeType: "system",
      description: TEST_RECORD_BADGE_DESCRIPTION,
      createdAt: new Date().toISOString(),
    },
  });
  if (!created.uri || !created.cid) {
    throw new TestAccountMutationError("Could not create the test-record badge.", 502);
  }
  return { uri: created.uri, cid: created.cid };
}

/** Flag a single record as a test record (idempotent). */
export async function flagTestRecord(
  repoDid: string,
  cookie: string | null,
  subjectUri: string,
): Promise<void> {
  const [state, cid] = await Promise.all([
    readTestRecordState(repoDid, subjectUri),
    fetchRecordCid(subjectUri),
  ]);
  if (state.flagged) return;
  const definition = state.definition ?? (await ensureTestRecordDefinition(repoDid, cookie));
  await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: BADGE_AWARD_COLLECTION,
    record: {
      $type: BADGE_AWARD_COLLECTION,
      badge: { uri: definition.uri, cid: definition.cid },
      subject: { $type: "com.atproto.repo.strongRef", uri: subjectUri, cid },
      note: TEST_RECORD_AWARD_NOTE,
      createdAt: new Date().toISOString(),
    },
  });
}

/** Remove the test-record flag from a record (idempotent). Deletes every
 *  matching award; the CGS layer may reject removing another steward's flag. */
export async function unflagTestRecord(
  repoDid: string,
  cookie: string | null,
  subjectUri: string,
): Promise<void> {
  const state = await readTestRecordState(repoDid, subjectUri);
  for (const award of state.awards) {
    await cgsMutate(repoDid, cookie, {
      operation: "deleteRecord",
      collection: BADGE_AWARD_COLLECTION,
      rkey: award.rkey,
    });
  }
}

/** The plain-language kind of a flagged record, derived from its collection. */
export type FlaggedTestRecordKind = "post" | "observation" | "project" | "organization" | "donation" | "record";

export type FlaggedTestRecord = {
  uri: string;
  kind: FlaggedTestRecordKind;
  ownerDid: string;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  /** In-app link to the hidden record's surface (owner page for posts). */
  href: string;
  flaggedAt: string;
};

function recordKind(collection: string): FlaggedTestRecordKind {
  switch (collection) {
    case "app.gainforest.feed.post":
      return "post";
    case "app.gainforest.dwc.occurrence":
      return "observation";
    case "org.hypercerts.collection":
      return "project";
    case "org.hypercerts.claim.activity":
      return "project";
    case "app.certified.actor.organization":
      return "organization";
    case "org.hypercerts.fundingReceipt":
      return "donation";
    default:
      return "record";
  }
}

function recordHref(kind: FlaggedTestRecordKind, did: string, collection: string, rkey: string): string {
  if (kind === "observation") return localObservationHref(did, rkey);
  if (collection === "org.hypercerts.collection") return localProjectHref(did, rkey);
  if (collection === "org.hypercerts.claim.activity") return localBumicertHref(did, rkey);
  return accountHref(did);
}

/** The records currently flagged as test records, resolved to their owner's
 *  display name + avatar for the admin list view. Newest flags first. */
export async function fetchFlaggedTestRecords(repoDid: string): Promise<FlaggedTestRecord[]> {
  const data = await fetchInternalBadgeData(repoDid, { includeAwards: true }).catch(() => null);
  if (!data) return [];
  const definition = findTestRecordDefinition(data.definitions);
  if (!definition) return [];

  const awards = data.awards.filter(
    (award) => award.badge.uri === definition.uri && award.subjectKind === "record",
  );
  const seen = new Set<string>();
  const flagged = await Promise.all(
    awards.map(async (award): Promise<FlaggedTestRecord | null> => {
      const uri = award.subjectLabel;
      const parsed = parseAtUri(uri);
      if (!parsed || seen.has(uri)) return null;
      seen.add(uri);
      const kind = recordKind(parsed.collection);
      const card = await getCertifiedProfileCard(parsed.did).catch(() => null);
      return {
        uri,
        kind,
        ownerDid: parsed.did,
        ownerName: card?.displayName?.trim() || null,
        ownerAvatarUrl: card?.avatarUrl ?? null,
        href: recordHref(kind, parsed.did, parsed.collection, parsed.rkey),
        flaggedAt: award.createdAt,
      };
    }),
  );
  return flagged
    .filter((entry): entry is FlaggedTestRecord => Boolean(entry))
    .sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt));
}
