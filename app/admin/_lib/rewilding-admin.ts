import "server-only";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import {
  fetchIndexedCertifiedProfileCards,
  fetchRecognitionBadgesForDids,
} from "@/app/_lib/indexer";
import {
  REWILDING_MILESTONES,
  effectiveRewildingMilestones,
  fetchRewildingMilestones,
  type RewildingMilestoneId,
} from "@/app/_lib/rewilding-milestones";
import { listRewildingDocuments } from "./rewilding-documents";

/**
 * Row assembly for the admin panel's "Rewilding the Web" section: one row per
 * grantee (everyone who applied for the grant, plus anyone who already has
 * milestone records or documents), each carrying the current milestone states
 * and uploaded grant documents.
 *
 * Documents are private: rows carry only their metadata, never a URL. The
 * file itself is fetched through the admin-gated download route, which mints
 * a short-lived link on demand.
 */

export type RewildingAdminMilestone = {
  id: RewildingMilestoneId;
  code: string;
  title: string;
  description: string;
  payout: { tranche: number; amountUsd: number } | null;
  done: boolean;
  /** When the current state was set, when any event exists. */
  updatedAt: string | null;
};

export type RewildingAdminDocument = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type RewildingAdminGrantee = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Holds the steward-awarded "Rewilding grant" recognition badge. */
  hasGrantBadge: boolean;
  /** The application post text, when the grantee applied through the feed. */
  applicationText: string | null;
  milestones: RewildingAdminMilestone[];
  documents: RewildingAdminDocument[];
};

/** One row per grantee: badge holders first, then newest applicants. */
export async function fetchRewildingAdminGrantees(): Promise<RewildingAdminGrantee[]> {
  const [applicants, milestoneRecords, documentRecords] = await Promise.all([
    fetchGrantApplicants().catch(() => []),
    fetchRewildingMilestones().catch(() => []),
    listRewildingDocuments().catch(() => []),
  ]);

  const currentMilestones = effectiveRewildingMilestones(milestoneRecords);

  // Applicants plus any DID that already has grant records — a grantee may
  // have been onboarded without an application post.
  const dids: string[] = [];
  const seen = new Set<string>();
  for (const applicant of applicants) {
    if (!seen.has(applicant.did)) {
      seen.add(applicant.did);
      dids.push(applicant.did);
    }
  }
  for (const record of [...currentMilestones, ...documentRecords]) {
    if (!seen.has(record.subjectDid)) {
      seen.add(record.subjectDid);
      dids.push(record.subjectDid);
    }
  }
  if (dids.length === 0) return [];

  const applicantByDid = new Map(applicants.map((applicant) => [applicant.did, applicant]));
  const extraDids = dids.filter((did) => !applicantByDid.has(did));
  const [badges, extraProfiles] = await Promise.all([
    fetchRecognitionBadgesForDids(dids).catch(() => new Map<string, Set<string>>()),
    extraDids.length > 0
      ? fetchIndexedCertifiedProfileCards(extraDids).catch(
          () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
        )
      : Promise.resolve(new Map<string, { displayName: string | null; avatarUrl: string | null }>()),
  ]);

  const rows = await Promise.all(
    dids.map(async (did): Promise<RewildingAdminGrantee> => {
      const applicant = applicantByDid.get(did);
      const profile = extraProfiles.get(did);
      const doneStates = new Map<RewildingMilestoneId, { done: boolean; createdAt: string }>();
      for (const record of currentMilestones) {
        if (record.subjectDid === did) {
          doneStates.set(record.milestoneId, { done: record.done, createdAt: record.createdAt });
        }
      }
      const documents: RewildingAdminDocument[] = documentRecords
        .filter((record) => record.subjectDid === did)
        .map((record) => ({
          id: record.id,
          title: record.title,
          fileName: record.fileName,
          sizeBytes: record.sizeBytes,
          uploadedAt: record.uploadedAt,
        }));
      return {
        did,
        displayName: applicant?.displayName ?? profile?.displayName ?? null,
        avatarUrl: applicant?.avatarUrl ?? profile?.avatarUrl ?? null,
        hasGrantBadge: badges.get(did)?.has("rewilding-grant") ?? false,
        applicationText: applicant?.applicationText || null,
        milestones: REWILDING_MILESTONES.map((definition) => ({
          id: definition.id,
          code: definition.code,
          title: definition.title,
          description: definition.description,
          payout: definition.payout ?? null,
          done: doneStates.get(definition.id)?.done ?? false,
          updatedAt: doneStates.get(definition.id)?.createdAt ?? null,
        })),
        documents,
      };
    }),
  );

  // Badge holders (actual grantees) first, then by name for a stable list.
  return rows.sort(
    (a, b) =>
      Number(b.hasGrantBadge) - Number(a.hasGrantBadge) ||
      (a.displayName ?? "").localeCompare(b.displayName ?? "", undefined, { sensitivity: "base" }),
  );
}
