import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessNotice } from "../_components/AccessNotice";
import { InternalBadgesDashboard } from "../_components/InternalBadgesDashboard";
import { getInternalBadgeAccess } from "../_lib/access";
import { fetchInternalBadgeData } from "../_lib/badge-records";

type Props = { params: Promise<{ badgeId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { badgeId } = await params;
  const t = await getTranslations("common.internalBadges.meta");
  return {
    title: t("detailTitle"),
    description: t("description"),
    alternates: { canonical: `/internal/badges/${encodeURIComponent(badgeId)}` },
  };
}

export default async function InternalBadgeDetailPage({ params }: Props) {
  const { badgeId } = await params;
  const decodedBadgeId = decodeURIComponent(badgeId);
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

  const data = await fetchInternalBadgeData(access.repoDid);
  const badge = data.definitions.find((definition) => definition.rkey === decodedBadgeId || definition.uri === decodedBadgeId);
  if (!badge) notFound();

  return <InternalBadgesDashboard initialData={data} writeRepo={access.writeRepo} selectedBadgeRkey={badge.rkey} />;
}
