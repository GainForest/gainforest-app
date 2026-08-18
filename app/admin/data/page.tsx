import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArchiveIcon, DatabaseIcon, WalletIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { EMPTY_FACILITATOR_STATS, loadDataJobRows } from "../_lib/admin-loaders";
import { fetchFacilitatorStats } from "../_lib/facilitator-stats";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminSectionTabs } from "../_components/AdminSectionTabs";
import { AdminDataJobsPanel } from "../_components/AdminDataJobsPanel";
import { AdminFacilitatorPanel } from "../_components/AdminFacilitatorPanel";

export const metadata: Metadata = {
  title: "Data & money · Admin",
  robots: { index: false, follow: false },
};

/** Data & money: partner data batches and the facilitator wallet. */
export default async function AdminDataPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const tDataJobs = await getTranslations("common.adminDataJobs");
  const tFacilitator = await getTranslations("common.adminFacilitator");

  const [{ tab }, dataJobRows, facilitatorStats] = await Promise.all([
    searchParams,
    loadDataJobRows(),
    fetchFacilitatorStats().catch(() => EMPTY_FACILITATOR_STATS),
  ]);

  return (
    <>
      <AdminPageHeader Icon={DatabaseIcon} title={t("pages.data.title")} subtitle={t("pages.data.subtitle")} backLabel={t("pages.hub.title")} />
      <AdminSectionTabs
        ariaLabel={t("ariaLabel")}
        initialTab={tab}
        tabs={[
          {
            id: "dataJobs",
            label: t("tabs.dataJobs"),
            icon: <ArchiveIcon className="size-4" />,
            count: dataJobRows?.length ?? 0,
            content: (
              <AdminPanel
                Icon={ArchiveIcon}
                title={tDataJobs("title")}
                description={tDataJobs("description")}
                count={dataJobRows?.length ?? 0}
              >
                <AdminDataJobsPanel rows={dataJobRows} />
              </AdminPanel>
            ),
          },
          {
            id: "facilitator",
            label: t("tabs.facilitator"),
            icon: <WalletIcon className="size-4" />,
            count: facilitatorStats.receiptCount ?? 0,
            content: (
              <AdminPanel
                Icon={WalletIcon}
                title={tFacilitator("title")}
                description={tFacilitator("description")}
                count={facilitatorStats.receiptCount ?? 0}
              >
                <AdminFacilitatorPanel stats={facilitatorStats} />
              </AdminPanel>
            ),
          },
        ]}
      />
    </>
  );
}
