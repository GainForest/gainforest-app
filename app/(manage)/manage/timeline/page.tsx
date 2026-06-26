import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountTimelinePath } from "@/app/account/_lib/account-route";

export async function generateMetadata(): Promise<Metadata> {
  const timelineT = await getTranslations("bumicert.detail.timeline");
  return {
    title: `${timelineT("title")} — GainForest`,
    description: timelineT("linkedDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function ManageTimelinePage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  if (target.accountKind !== "organization") notFound();

  redirect(accountTimelinePath(target.identifier));
}
