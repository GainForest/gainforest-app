import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getInternalBadgeAccess } from "./_lib/access";
import { fetchInternalBadgeData } from "./_lib/badge-records";
import { AccessNotice } from "./_components/AccessNotice";
import { InternalBadgesDashboard } from "./_components/InternalBadgesDashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.internalBadges.meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function InternalBadgesPage() {
  const t = await getTranslations("common.internalBadges.access");
  const access = await getInternalBadgeAccess();

  if (!access.isLoggedIn) {
    return <AccessNotice title={t("signedOutTitle")} description={t("signedOutDescription")} showAuthButton />;
  }

  if (!access.configured) {
    return <AccessNotice title={t("notConfiguredTitle")} description={t("notConfiguredDescription")} />;
  }

  if (!access.allowed || !access.repoDid) {
    return <AccessNotice title={t("deniedTitle")} description={t("deniedDescription")} />;
  }

  const data = await fetchInternalBadgeData(access.repoDid, { includeAwards: false });
  return <InternalBadgesDashboard initialData={data} writeRepo={access.writeRepo} />;
}
