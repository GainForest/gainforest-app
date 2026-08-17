import { getInternalBadgeAccess } from "@/app/internal/badges/_lib/access";
import { fetchTainaAdminResidents } from "@/app/_lib/taina-agent";
import { hasStoredAgentKey, isDataJobsConfigured, listAllJobs, toPublicJob } from "@/app/_lib/data-jobs";
import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import { fetchEndorsementAwarding, type AwardEndorsementsData } from "./award-endorsements";
import type { AdminTainaRow } from "../_components/AdminTainaPanel";
import type { AdminDataJobRow } from "../_components/AdminDataJobsPanel";
import type { FacilitatorStats } from "./facilitator-stats";

export const EMPTY_FACILITATOR_STATS: FacilitatorStats = {
  address: null,
  txCount: null,
  ethBalance: null,
  receiptCount: null,
  usdVolume: null,
};

/**
 * The Tainá roster for the admin pages: runtime data (bot, last used, credit
 * spend) enriched with each owner's display name + avatar. `null` signals the
 * runtime is unreachable — distinct from "nobody has a Tainá yet".
 */
export async function loadTainaRows(): Promise<{ rows: AdminTainaRow[]; allowanceUsd: number } | null> {
  try {
    const { residents, allowanceUsd } = await fetchTainaAdminResidents();
    const cards = await fetchIndexedCertifiedProfileCards(residents.map((r) => r.did)).catch(
      () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
    );
    const rows = residents
      .map((resident) => ({
        ...resident,
        displayName: cards.get(resident.did)?.displayName ?? null,
        avatarUrl: cards.get(resident.did)?.avatarUrl ?? null,
      }))
      // Most recently active first; never-used agents sink to the bottom.
      .sort((a, b) =>
        (b.lastUsedAt ?? b.provisionedAt).localeCompare(a.lastUsedAt ?? a.provisionedAt),
      );
    return { rows, allowanceUsd };
  } catch {
    return null;
  }
}

/**
 * Partner data batches for the admin pages: every job in the ingest bucket,
 * enriched with the submitter's display name + avatar and whether their
 * publish-on-behalf agent key is still stored. `null` signals storage is
 * unconfigured or unreachable — distinct from "no batches yet".
 */
export async function loadDataJobRows(): Promise<AdminDataJobRow[] | null> {
  if (!isDataJobsConfigured()) return null;
  try {
    const jobs = await listAllJobs();
    const cards = await fetchIndexedCertifiedProfileCards(jobs.map((job) => job.did)).catch(
      () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
    );
    const keyByDid = new Map<string, boolean>();
    await Promise.all(
      [...new Set(jobs.map((job) => job.did))].map(async (did) => {
        keyByDid.set(did, await hasStoredAgentKey(did).catch(() => false));
      }),
    );
    return jobs.map((job) => ({
      ...toPublicJob(job, keyByDid.get(job.did) ?? false),
      displayName: cards.get(job.did)?.displayName ?? null,
      avatarUrl: cards.get(job.did)?.avatarUrl ?? null,
    }));
  } catch {
    return null;
  }
}

/**
 * "Award endorsements" needs more than moderator access: the awards are signed
 * by the GainForest org itself, so the viewer must be an owner/admin of that
 * org (checked again server-side by the internal badge API on every write).
 * Everyone else gets `allowed: false` and a notice.
 */
export async function loadAwardEndorsements(): Promise<AwardEndorsementsData> {
  const access = await getInternalBadgeAccess().catch(() => null);
  if (!access?.allowed || !access.repoDid) return { allowed: false, definitions: [], awards: [] };
  const { definitions, awards } = await fetchEndorsementAwarding(access.repoDid).catch(
    () => ({ definitions: [], awards: [] }),
  );
  return { allowed: true, definitions, awards };
}
