import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LeafIcon, SproutIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import { bioblitzRounds } from "@/app/_lib/bioblitz";
import { fetchBioblitzExclusionRows } from "@/app/internal/badges/_lib/bioblitz-exclusion-mutations";
import { loadBioblitzAdminRound } from "../_lib/bioblitz-dashboard";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminSectionTabs } from "../_components/AdminSectionTabs";
import { AdminGrantApplicantsList } from "../_components/AdminGrantApplicantsList";
import { AdminBioblitzDashboard } from "../_components/AdminBioblitzDashboard";

export const metadata: Metadata = {
  title: "Grants · Admin",
  robots: { index: false, follow: false },
};

/**
 * Grant management: who applied for the Rewilding the Web grant, and the
 * BioBlitz round dashboard that picks the weekly winners.
 */
export default async function AdminGrantsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const now = Date.now();
  const adminBioblitzRounds = bioblitzRounds(now, 0);
  const defaultBioblitzRoundId = adminBioblitzRounds.at(-1)?.id ?? 1;

  const [{ tab }, grantApplicants, initialBioblitzData, bioblitzExclusions] = await Promise.all([
    searchParams,
    fetchGrantApplicants().catch(() => []),
    loadBioblitzAdminRound(defaultBioblitzRoundId, now, moderator.repoDid).catch(() => null),
    fetchBioblitzExclusionRows().catch(() => null),
  ]);

  return (
    <>
      <AdminPageHeader Icon={SproutIcon} title={t("pages.grants.title")} subtitle={t("pages.grants.subtitle")} />
      <AdminSectionTabs
        ariaLabel={t("ariaLabel")}
        initialTab={tab}
        tabs={[
          {
            id: "grants",
            label: t("tabs.grants"),
            icon: <SproutIcon className="size-4" />,
            count: grantApplicants.length,
            content: (
              <AdminPanel
                Icon={SproutIcon}
                title={t("grants.title")}
                description={t("grants.description")}
                count={grantApplicants.length}
                footer={t("awardHint")}
              >
                <AdminGrantApplicantsList applicants={grantApplicants} />
              </AdminPanel>
            ),
          },
          {
            id: "bioblitz",
            label: t("tabs.bioblitz"),
            icon: <LeafIcon className="size-4" />,
            count: initialBioblitzData?.registrants.length ?? 0,
            content: (
              <AdminBioblitzDashboard
                rounds={adminBioblitzRounds}
                defaultRoundId={defaultBioblitzRoundId}
                initialData={initialBioblitzData}
                initialExclusions={bioblitzExclusions}
                canManage={moderator.isModerator}
              />
            ),
          },
        ]}
      />
    </>
  );
}
