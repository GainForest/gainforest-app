import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountProjectsPath } from "@/app/account/_lib/account-route";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bumicert.createAlias.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

// Creating a project now also creates its impact certificate automatically, so
// the standalone Cert studio redirects into the project create flow.
export default async function CreateBumicertPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? `${accountProjectsPath(target.identifier)}?mode=new` : "/manage/projects?mode=new");
}
