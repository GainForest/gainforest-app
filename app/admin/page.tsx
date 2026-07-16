import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheckIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { getGainForestModeratorAccess, getInternalBadgeAccess } from "@/app/internal/badges/_lib/access";
import { fetchFlaggedTestAccounts } from "@/app/internal/badges/_lib/test-accounts";
import { fetchFlaggedTestRecords } from "@/app/internal/badges/_lib/test-records";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import { fetchBioblitzRegistrants } from "@/app/_lib/bioblitz";
import { fetchTainaAdminResidents } from "@/app/_lib/taina-agent";
import { hasStoredAgentKey, isDataJobsConfigured, listAllJobs, toPublicJob } from "@/app/_lib/data-jobs";
import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import { BUILTIN_ENDORSERS, fetchEndorserRecords } from "@/app/_lib/endorsers";
import { fetchEndorsementAwarding, type AwardEndorsementsData } from "./_lib/award-endorsements";
import { fetchFacilitatorStats, type FacilitatorStats } from "./_lib/facilitator-stats";
import { AdminModerationDashboard, type AdminTab } from "./_components/AdminModerationDashboard";
import type { AdminTainaRow } from "./_components/AdminTainaPanel";
import type { AdminDataJobRow } from "./_components/AdminDataJobsPanel";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const TABS: AdminTab[] = ["taina", "dataJobs", "grants", "bioblitz", "testAccounts", "endorsers", "awardEndorsements", "facilitator"];

const EMPTY_FACILITATOR_STATS: FacilitatorStats = {
  address: null,
  txCount: null,
  ethBalance: null,
  receiptCount: null,
  usdVolume: null,
};

/**
 * The Tainá roster for the admin panel: runtime data (bot, last used, credit
 * spend) enriched with each owner's display name + avatar. `null` signals the
 * runtime is unreachable — distinct from "nobody has a Tainá yet".
 */
async function loadTainaRows(): Promise<{ rows: AdminTainaRow[]; allowanceUsd: number } | null> {
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
 * Partner data batches for the admin panel: every job in the ingest bucket,
 * enriched with the submitter's display name + avatar and whether their
 * publish-on-behalf agent key is still stored. `null` signals storage is
 * unconfigured or unreachable — distinct from "no batches yet".
 */
async function loadDataJobRows(): Promise<AdminDataJobRow[] | null> {
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
 * The "Award endorsements" tab needs more than moderator access: the awards
 * are signed by the GainForest org itself, so the viewer must be an
 * owner/admin of that org (checked again server-side by the internal badge
 * API on every write). Everyone else gets `allowed: false` and a notice.
 */
async function loadAwardEndorsements(): Promise<AwardEndorsementsData> {
  const access = await getInternalBadgeAccess().catch(() => null);
  if (!access?.allowed || !access.repoDid) return { allowed: false, definitions: [], awards: [] };
  const { definitions, awards } = await fetchEndorsementAwarding(access.repoDid).catch(
    () => ({ definitions: [], awards: [] }),
  );
  return { allowed: true, definitions, awards };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Standalone moderation panel, gated to members of the admin group (any role).
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const t = await getTranslations("common.adminModeration");
  const [{ tab }, testAccounts, testRecords, grantApplicants, bioblitzRegistrants, taina, dataJobRows, endorsers, awardEndorsements, facilitatorStats] = await Promise.all([
    searchParams,
    fetchFlaggedTestAccounts().catch(() => []),
    moderator.repoDid ? fetchFlaggedTestRecords(moderator.repoDid).catch(() => []) : Promise.resolve([]),
    fetchGrantApplicants().catch(() => []),
    fetchBioblitzRegistrants().catch(() => []),
    loadTainaRows(),
    loadDataJobRows(),
    moderator.repoDid ? fetchEndorserRecords(moderator.repoDid).catch(() => []) : Promise.resolve([]),
    loadAwardEndorsements(),
    fetchFacilitatorStats().catch(() => EMPTY_FACILITATOR_STATS),
  ]);

  const initialTab: AdminTab = TABS.includes(tab as AdminTab) ? (tab as AdminTab) : "taina";

  return (
    <Container className="pt-4 pb-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-muted-foreground" />
          <h1 className="font-instrument text-3xl font-light italic tracking-[-0.04em]">{t("page.title")}</h1>
          <AdminOnlyIndicator className="text-muted-foreground" />
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{t("page.subtitle")}</p>
      </header>
      <AdminModerationDashboard
        initialTab={initialTab}
        testAccounts={testAccounts}
        testRecords={testRecords}
        grantApplicants={grantApplicants}
        bioblitzRegistrants={bioblitzRegistrants}
        tainaRows={taina?.rows ?? null}
        tainaAllowanceUsd={taina?.allowanceUsd ?? 25}
        dataJobRows={dataJobRows}
        builtinEndorsers={BUILTIN_ENDORSERS}
        endorsers={endorsers}
        awardEndorsements={awardEndorsements}
        facilitatorStats={facilitatorStats}
      />
    </Container>
  );
}
