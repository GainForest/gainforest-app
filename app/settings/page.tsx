import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountSettingsPath } from "@/app/account/_lib/account-route";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.settings.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function SettingsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) redirect("/");
  const target = await resolvePersonalManageTarget();
  redirect(target ? accountSettingsPath(target.identifier) : "/manage?tab=settings");
}
