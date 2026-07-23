import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountPath } from "./_lib/account-route";

export async function generateMetadata(): Promise<Metadata> {
  const [navigationT, seoT] = await Promise.all([
    getTranslations("common.sidebar.items"),
    getTranslations("common.seo"),
  ]);
  return {
    title: navigationT("profile"),
    description: seoT("description"),
    robots: { index: false, follow: true },
  };
}

export default async function AccountPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? accountPath(target.identifier) : "/manage");
}
