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
import {
  effectiveRewildingGrantees,
  fetchRewildingGrantees,
} from "@/app/_lib/rewilding-grantees";
import { listRewildingDocuments } from "./rewilding-documents";

/**
 * Row assembly for the admin panel's "Rewilding the Web" section: one row per
 * enrolled organization, in slot order (first accepted first), each carrying
 * the current milestone states and uploaded grant documents. Only explicitly
 * enrolled organizations appear — applying for the grant puts someone in the
 * applicants list, not in a slot.
 *
 * Documents are private: rows carry only their metadata, never a URL. The
 * file itself is fetched through the admin-gated download route, which mints
 * a short-lived link on demand.
 */

export type RewildingAdminMilestone = {
  /** Program milestone id ("m1"…"m4"). Also the key its name is looked up
   *  under in `common.rewildingProgram.milestones`. */
  id: RewildingMilestoneId;
  code: string;
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
  /** When this organization was accepted into its slot. */
  enrolledAt: string;
  milestones: RewildingAdminMilestone[];
  documents: RewildingAdminDocument[];
};

/** One row per enrolled organization, in slot order. */
export async function fetchRewildingAdminGrantees(): Promise<RewildingAdminGrantee[]> {
  const enrollmentRecords = await fetchRewildingGrantees().catch(() => []);
  const enrolled = effectiveRewildingGrantees(enrollmentRecords);
  if (enrolled.length === 0) return [];

  const [applicants, milestoneRecords, documentRecords] = await Promise.all([
    fetchGrantApplicants().catch(() => []),
    fetchRewildingMilestones().catch(() => []),
    listRewildingDocuments().catch(() => []),
  ]);

  const currentMilestones = effectiveRewildingMilestones(milestoneRecords);
  const dids = enrolled.map((record) => record.subjectDid);
  const enrolledAtByDid = new Map(enrolled.map((record) => [record.subjectDid, record.createdAt]));

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
        enrolledAt: enrolledAtByDid.get(did) ?? "",
        milestones: REWILDING_MILESTONES.map((definition) => ({
          id: definition.id,
          code: definition.code,
          payout: definition.payout ?? null,
          done: doneStates.get(definition.id)?.done ?? false,
          updatedAt: doneStates.get(definition.id)?.createdAt ?? null,
        })),
        documents,
      };
    }),
  );

  // Slot order: the first organization accepted holds the first slot.
  return rows.sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt) || a.did.localeCompare(b.did));
}
