import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountPath } from "./_lib/account-route";

export const metadata: Metadata = {
  title: "Account — GainForest",
  description: "Open your public GainForest account profile.",
  robots: { index: false, follow: true },
};

export default async function AccountPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? accountPath(target.identifier) : "/manage");
}
