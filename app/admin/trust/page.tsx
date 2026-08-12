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
import { AdminTestAccountsList } from "../_components/AdminTestAccountsList";
import { AdminTestRecordsList } from "../_components/AdminTestRecordsList";
import { AdminBlockedDomains } from "../_components/AdminBlockedDomains";

export const metadata: Metadata = {
  title: "Trust & safety · Admin",
  robots: { index: false, follow: false },
};

/** Trust & safety: flagged test accounts and records, plus blocked addresses. */
export default async function AdminTrustPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.adminModeration");
  const tTest = await getTranslations("common.adminTestAccounts");
  const tTestRecords = await getTranslations("common.adminTestRecords");
  const tBlockedDomains = await getTranslations("common.adminBlockedDomains");

  const [testAccounts, testRecords, builtinBlockedDomains, blockedDomains] = await Promise.all([
    fetchFlaggedTestAccounts().catch(() => []),
    moderator.repoDid ? fetchFlaggedTestRecords(moderator.repoDid).catch(() => []) : Promise.resolve([]),
    fetchBuiltinBlockedDomainRows().catch(() => []),
    fetchBlockedDomainRows().catch(() => null),
  ]);

  return (
    <>
      <AdminPageHeader Icon={ShieldCheckIcon} title={t("pages.trust.title")} subtitle={t("pages.trust.subtitle")} />
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
      </div>
    </>
  );
}
