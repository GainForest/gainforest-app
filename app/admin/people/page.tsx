import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AwardIcon, BotIcon, Building2Icon, UsersIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { BUILTIN_ENDORSERS, fetchEndorserRecords } from "@/app/_lib/endorsers";
import { loadAwardEndorsements, loadTainaRows } from "../_lib/admin-loaders";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminSectionTabs } from "../_components/AdminSectionTabs";
import { AdminTainaPanel } from "../_components/AdminTainaPanel";
import { EndorsersManager } from "../_components/EndorsersManager";
import { AwardEndorsementsPanel } from "../_components/AwardEndorsementsPanel";

export const metadata: Metadata = {
  title: "People · Admin",
  robots: { index: false, follow: false },
};

/**
 * People: everyone running a Tainá field assistant, the organizations allowed
 * to endorse accounts, and the badges GainForest itself awards.
 */
export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const tTaina = await getTranslations("common.adminTaina");
  const tEndorsers = await getTranslations("common.adminEndorsers");
  const tAward = await getTranslations("common.adminAwardEndorsements");

  const [{ tab }, taina, endorsers, awardEndorsements] = await Promise.all([
    searchParams,
    loadTainaRows(),
    moderator.repoDid ? fetchEndorserRecords(moderator.repoDid).catch(() => []) : Promise.resolve([]),
    loadAwardEndorsements(),
  ]);

  return (
    <>
      <AdminPageHeader Icon={UsersIcon} title={t("pages.people.title")} subtitle={t("pages.people.subtitle")} />
      <AdminSectionTabs
        ariaLabel={t("ariaLabel")}
        initialTab={tab}
        tabs={[
          {
            id: "taina",
            label: t("tabs.taina"),
            icon: <BotIcon className="size-4" />,
            count: taina?.rows.length ?? 0,
            content: (
              <AdminPanel
                Icon={BotIcon}
                title={tTaina("title")}
                description={tTaina("description")}
                count={taina?.rows.length ?? 0}
              >
                <AdminTainaPanel rows={taina?.rows ?? null} allowanceUsd={taina?.allowanceUsd ?? 25} />
              </AdminPanel>
            ),
          },
          {
            id: "endorsers",
            label: t("tabs.endorsers"),
            icon: <Building2Icon className="size-4" />,
            count: BUILTIN_ENDORSERS.length + endorsers.length,
            content: (
              <AdminPanel
                Icon={Building2Icon}
                title={tEndorsers("title")}
                description={tEndorsers("description")}
                count={BUILTIN_ENDORSERS.length + endorsers.length}
                footer={tEndorsers("propagationHint")}
              >
                <EndorsersManager builtins={BUILTIN_ENDORSERS} initial={endorsers} />
              </AdminPanel>
            ),
          },
          {
            id: "awardEndorsements",
            label: t("tabs.awardEndorsements"),
            icon: <AwardIcon className="size-4" />,
            count: awardEndorsements.awards.length,
            content: (
              <AdminPanel
                Icon={AwardIcon}
                title={tAward("title")}
                description={tAward("description")}
                count={awardEndorsements.awards.length}
                footer={awardEndorsements.allowed ? tAward("propagationHint") : undefined}
              >
                <AwardEndorsementsPanel data={awardEndorsements} />
              </AdminPanel>
            ),
          },
        ]}
      />
    </>
  );
}
