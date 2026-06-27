import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { NewBumicertSection } from "@/app/(manage)/manage/_sections";
import { readAccountRouteParams } from "../../../_lib/account-route";

export const metadata: Metadata = {
  title: "New Cert — GainForest",
  robots: { index: false, follow: false },
};

export default async function AccountNewCertPage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { urlIdentifier } = await readAccountRouteParams(params);
  const access = await resolveAccountManageAccess(urlIdentifier);
  if (access.status !== "allowed") notFound();

  return <NewBumicertSection target={access.target} searchParams={await searchParams} />;
}
