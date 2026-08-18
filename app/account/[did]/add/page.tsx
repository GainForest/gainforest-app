import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { AddDataSection } from "@/app/(manage)/manage/_sections";
import { readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Add data — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountAddDataPage({ params }: { params: Promise<{ did: string }> }) {
  const { urlIdentifier } = await readAccountRouteParams(params);
  const access = await resolveAccountManageAccess(urlIdentifier);
  if (access.status !== "allowed") notFound();

  return <AddDataSection target={access.target} />;
}
