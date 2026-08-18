import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChartColumnIcon, WalletIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { loadWalletStats } from "../_lib/wallet-stats";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminSectionTabs } from "../_components/AdminSectionTabs";
import { AdminWalletStatsPanel } from "../_components/AdminWalletStatsPanel";

export const metadata: Metadata = {
  title: "Statistics · Admin",
  robots: { index: false, follow: false },
};

/**
 * Statistics: app-wide numbers for the team. First statistic: how many
 * wallets have been created, and by whom. Everything is loaded from the
 * indexer's per-collection record index, so no repo scans are involved and
 * the page can render the full picture server-side.
 */
export default async function AdminStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const tWallets = await getTranslations("common.adminWalletStats");

  const [{ tab }, wallets] = await Promise.all([
    searchParams,
    loadWalletStats().catch(() => null),
  ]);

  return (
    <>
      <AdminPageHeader
        Icon={ChartColumnIcon}
        title={t("pages.statistics.title")}
        subtitle={t("pages.statistics.subtitle")}
        backLabel={t("pages.hub.title")}
      />
      <AdminSectionTabs
        ariaLabel={t("ariaLabel")}
        initialTab={tab}
        tabs={[
          {
            id: "walletsCreated",
            label: t("tabs.walletsCreated"),
            icon: <WalletIcon className="size-4" />,
            count: wallets?.rows.length,
            content: (
              <AdminPanel
                Icon={WalletIcon}
                title={tWallets("title")}
                description={tWallets("description")}
                count={wallets?.rows.length}
              >
                <AdminWalletStatsPanel rows={wallets?.rows ?? null} />
              </AdminPanel>
            ),
          },
        ]}
      />
    </>
  );
}
