import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountProjectsPath } from "@/app/account/_lib/account-route";

export const metadata: Metadata = {
  title: "Create project",
  description: "Create and publish a project on GainForest.",
  robots: { index: false, follow: false },
};

// Creating a project now also creates its impact certificate automatically, so
// the standalone Cert studio redirects into the project create flow.
export default async function CreateBumicertPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? `${accountProjectsPath(target.identifier)}?mode=new` : "/manage/projects?mode=new");
}
