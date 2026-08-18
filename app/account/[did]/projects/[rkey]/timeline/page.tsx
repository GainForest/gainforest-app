import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { ProjectTimelineSection } from "@/app/(manage)/manage/_sections";
import { readAccountRouteParams } from "../../../../_lib/account-route";

export const metadata: Metadata = {
  title: "Project timeline — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountProjectTimelinePage({
  params,
}: {
  params: Promise<{ did: string; rkey: string }>;
}) {
  const { urlIdentifier } = await readAccountRouteParams(params);
  const { rkey } = await params;
  const access = await resolveAccountManageAccess(urlIdentifier);
  if (access.status !== "allowed") notFound();

  return <ProjectTimelineSection target={access.target} projectRkey={decodeURIComponent(rkey)} />;
}
