import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LeafIcon, SproutIcon, TreesIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchGrantApplicants } from "@/app/_lib/grants";
import { bioblitzRounds } from "@/app/_lib/bioblitz";
import { fetchBioblitzExclusionRows } from "@/app/internal/badges/_lib/bioblitz-exclusion-mutations";
import { loadBioblitzAdminRound } from "../_lib/bioblitz-dashboard";
import { fetchRewildingAdminGrantees } from "../_lib/rewilding-admin";
import { isRewildingDocumentStorageConfigured } from "../_lib/rewilding-documents";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminCollapsiblePanel } from "../_components/AdminCollapsiblePanel";
import { AdminSectionTabs } from "../_components/AdminSectionTabs";
import { AdminGrantApplicantsList } from "../_components/AdminGrantApplicantsList";
import { AdminBioblitzDashboard } from "../_components/AdminBioblitzDashboard";
import { AdminRewildingPanel } from "../_components/AdminRewildingPanel";

export const metadata: Metadata = {
  title: "Grants · Admin",
  robots: { index: false, follow: false },
};

/**
 * Grant management: who applied for the Rewilding the Web grant, each
 * grantee's milestone confirmations and grant documents, and the BioBlitz
 * round dashboard that picks the weekly winners.
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

  const [{ tab }, grantApplicants, rewildingGrantees, initialBioblitzData, bioblitzExclusions] = await Promise.all([
    searchParams,
    fetchGrantApplicants().catch(() => []),
    fetchRewildingAdminGrantees().catch(() => []),
    loadBioblitzAdminRound(defaultBioblitzRoundId, now, moderator.repoDid).catch(() => null),
    fetchBioblitzExclusionRows().catch(() => null),
  ]);

  return (
    <>
      <AdminPageHeader Icon={SproutIcon} title={t("pages.grants.title")} subtitle={t("pages.grants.subtitle")} backLabel={t("pages.hub.title")} />
      <AdminSectionTabs
        ariaLabel={t("ariaLabel")}
        initialTab={tab}
        tabs={[
          {
            // Trees rather than a leaf: BioBlitz already owns the leaf in this
            // same pill bar, and two identical icons side by side read as a bug.
            id: "rewilding",
            label: t("rewilding.title"),
            icon: <TreesIcon className="size-4" />,
            count: rewildingGrantees.length,
            content: (
              <div className="flex flex-col gap-5">
                <AdminPanel
                  Icon={TreesIcon}
                  title={t("rewilding.title")}
                  description={t("rewilding.description")}
                  count={rewildingGrantees.length}
                  footer={t("rewilding.footer")}
                >
                  <AdminRewildingPanel
                    grantees={rewildingGrantees}
                    documentStorageConfigured={isRewildingDocumentStorageConfigured()}
                  />
                </AdminPanel>
                <AdminCollapsiblePanel
                  Icon={SproutIcon}
                  title={t("grants.title")}
                  description={t("grants.description")}
                  count={grantApplicants.length}
                  footer={t("awardHint")}
                >
                  <AdminGrantApplicantsList applicants={grantApplicants} />
                </AdminCollapsiblePanel>
              </div>
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
