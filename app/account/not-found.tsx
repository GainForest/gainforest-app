import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GracefulNotFound } from "../_components/GracefulNotFound";

export async function generateMetadata(): Promise<Metadata> {
  const [legacyT, notFoundT] = await Promise.all([
    getTranslations("legacy"),
    getTranslations("common.notFound"),
  ]);
  return {
    title: legacyT("accountProfileMissing"),
    description: notFoundT("description"),
    robots: { index: false, follow: false },
  };
}

export default async function AccountNotFound() {
  const [legacyT, notFoundT, navigationT] = await Promise.all([
    getTranslations("legacy"),
    getTranslations("common.notFound"),
    getTranslations("common.sidebar.items"),
  ]);
  return (
    <GracefulNotFound
      title={legacyT("accountProfileMissing")}
      message={notFoundT("description")}
      primaryHref="/organizations"
      primaryLabel={navigationT("organizations")}
      secondaryHref="/projects"
      secondaryLabel={navigationT("projects")}
    />
  );
}
