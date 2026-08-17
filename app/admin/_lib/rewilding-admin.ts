import "server-only";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import {
  fetchIndexedCertifiedProfileCards,
  fetchRecognitionBadgesForDids,
} from "@/app/_lib/indexer";
import { resolveDidHandle } from "@/app/_lib/pds";
import {
  effectiveRewildingMilestones,
  fetchRewildingMilestonePlans,
  fetchRewildingMilestones,
  resolveRewildingMilestonePlan,
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
  /** Program milestone id ("m1"…"m4", named in translated copy under
   *  `common.rewildingProgram.milestones`) or a custom milestone id. */
  id: string;
  /** Short program code ("M1"…). Custom milestones have none. */
  code: string | null;
  /** Admin-written name for a custom milestone; null for program milestones. */
  title: string | null;
  /** Calendar date (YYYY-MM-DD) this milestone is due for this grantee. */
  dueDate: string | null;
  isCustom: boolean;
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
  /** Handle of the enrolled account. Display names are not unique, so this is
   *  how an admin tells which account holds the slot. */
  handle: string | null;
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

  const [applicants, milestoneRecords, milestonePlanRecords, documentRecords] = await Promise.all([
    fetchGrantApplicants().catch(() => []),
    fetchRewildingMilestones().catch(() => []),
    fetchRewildingMilestonePlans().catch(() => []),
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
      const doneStates = new Map<string, { done: boolean; createdAt: string }>();
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
      const handle = await resolveDidHandle(did).catch(() => null);
      return {
        did,
        displayName: applicant?.displayName ?? profile?.displayName ?? null,
        handle,
        avatarUrl: applicant?.avatarUrl ?? profile?.avatarUrl ?? null,
        hasGrantBadge: badges.get(did)?.has("rewilding-grant") ?? false,
        applicationText: applicant?.applicationText || null,
        enrolledAt: enrolledAtByDid.get(did) ?? "",
        milestones: resolveRewildingMilestonePlan(milestonePlanRecords, did).map((resolved) => ({
          id: resolved.id,
          code: resolved.code,
          title: resolved.title,
          dueDate: resolved.dueDate,
          isCustom: resolved.isCustom,
          payout: resolved.payout,
          done: doneStates.get(resolved.id)?.done ?? false,
          updatedAt: doneStates.get(resolved.id)?.createdAt ?? null,
        })),
        documents,
      };
    }),
  );

  // Slot order: the first organization accepted holds the first slot.
  return rows.sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt) || a.did.localeCompare(b.did));
}
