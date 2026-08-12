import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FlaskConicalIcon, ServerOffIcon, ShieldCheckIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchFlaggedTestAccounts } from "@/app/internal/badges/_lib/test-accounts";
import { fetchFlaggedTestRecords } from "@/app/internal/badges/_lib/test-records";
import {
  fetchBlockedDomainRows,
  fetchBuiltinBlockedDomainRows,
} from "@/app/internal/badges/_lib/blocked-domain-mutations";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminPanel } from "../_components/AdminPanel";
import { AdminSectionTabs } from "../_components/AdminSectionTabs";
import { AdminTestAccountsList } from "../_components/AdminTestAccountsList";
import { AdminTestRecordsList } from "../_components/AdminTestRecordsList";
import { AdminBlockedDomains } from "../_components/AdminBlockedDomains";

export const metadata: Metadata = {
  title: "Trust & safety · Admin",
  robots: { index: false, follow: false },
};

/** Trust & safety: flagged test accounts and records, plus blocked addresses. */
export default async function AdminTrustPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const tTest = await getTranslations("common.adminTestAccounts");
  const tTestRecords = await getTranslations("common.adminTestRecords");
  const tBlockedDomains = await getTranslations("common.adminBlockedDomains");

  const [{ tab }, testAccounts, testRecords, builtinBlockedDomains, blockedDomains] = await Promise.all([
    searchParams,
    fetchFlaggedTestAccounts().catch(() => []),
    moderator.repoDid ? fetchFlaggedTestRecords(moderator.repoDid).catch(() => []) : Promise.resolve([]),
    fetchBuiltinBlockedDomainRows().catch(() => []),
    fetchBlockedDomainRows().catch(() => null),
  ]);

  return (
    <>
      <AdminPageHeader Icon={ShieldCheckIcon} title={t("pages.trust.title")} subtitle={t("pages.trust.subtitle")} />
      <AdminSectionTabs
        ariaLabel={t("ariaLabel")}
        initialTab={tab}
        tabs={[
          {
            id: "testAccounts",
            label: t("tabs.testAccounts"),
            icon: <FlaskConicalIcon className="size-4" />,
            count: testAccounts.length + testRecords.length,
            // Accounts and the records hidden from the public feed stay
            // together, exactly as the old "Test accounts" tab showed them.
            content: (
              <div className="space-y-5">
                <AdminPanel
                  Icon={FlaskConicalIcon}
                  title={tTest("title")}
                  description={tTest("description")}
                  count={testAccounts.length}
                >
                  <AdminTestAccountsList accounts={testAccounts} />
                </AdminPanel>
                <AdminPanel
                  Icon={FlaskConicalIcon}
                  title={tTestRecords("title")}
                  description={tTestRecords("description")}
                  count={testRecords.length}
                >
                  <AdminTestRecordsList records={testRecords} />
                </AdminPanel>
              </div>
            ),
          },
          {
            id: "blockedDomains",
            label: t("tabs.blockedDomains"),
            icon: <ServerOffIcon className="size-4" />,
            count: builtinBlockedDomains.length + (blockedDomains?.length ?? 0),
            content: (
              <AdminPanel
                Icon={ServerOffIcon}
                title={tBlockedDomains("title")}
                description={tBlockedDomains("description")}
                count={builtinBlockedDomains.length + (blockedDomains?.length ?? 0)}
                footer={tBlockedDomains("propagationHint")}
              >
                <AdminBlockedDomains
                  builtins={builtinBlockedDomains}
                  initial={blockedDomains}
                  canManage={moderator.isModerator}
                />
              </AdminPanel>
            ),
          },
        ]}
      />
    </>
  );
}
