import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArchiveIcon, DatabaseIcon, WalletIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { EMPTY_FACILITATOR_STATS, loadDataJobRows } from "../_lib/admin-loaders";
import { fetchFacilitatorStats } from "../_lib/facilitator-stats";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminDataJobsPanel } from "../_components/AdminDataJobsPanel";
import { AdminFacilitatorPanel } from "../_components/AdminFacilitatorPanel";

export const metadata: Metadata = {
  title: "Data & money · Admin",
  robots: { index: false, follow: false },
};

/** Data & money: partner data batches and the facilitator wallet. */
export default async function AdminDataPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const tDataJobs = await getTranslations("common.adminDataJobs");
  const tFacilitator = await getTranslations("common.adminFacilitator");

  const [dataJobRows, facilitatorStats] = await Promise.all([
    loadDataJobRows(),
    fetchFacilitatorStats().catch(() => EMPTY_FACILITATOR_STATS),
  ]);

  return (
    <>
      <AdminPageHeader Icon={DatabaseIcon} title={t("pages.data.title")} subtitle={t("pages.data.subtitle")} />
      <div className="space-y-5">
        <AdminPanel
          Icon={ArchiveIcon}
          title={tDataJobs("title")}
          description={tDataJobs("description")}
          count={dataJobRows?.length ?? 0}
        >
          <AdminDataJobsPanel rows={dataJobRows} />
        </AdminPanel>
        <AdminPanel
          Icon={WalletIcon}
          title={tFacilitator("title")}
          description={tFacilitator("description")}
          count={facilitatorStats.receiptCount ?? 0}
        >
          <AdminFacilitatorPanel stats={facilitatorStats} />
        </AdminPanel>
      </div>
    </>
  );
}
