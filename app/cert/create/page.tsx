import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountNewCertPath } from "@/app/account/_lib/account-route";

export const metadata: Metadata = {
  title: "Create Cert",
  description: "Create and publish a Cert impact story from GainForest.",
  robots: { index: false, follow: false },
};

export default async function CreateBumicertPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? accountNewCertPath(target.identifier) : "/manage/certs/new");
}
