import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAccountRouteData, resolveIdentifierToDid } from "@/app/account/_lib/account-route";
import { ManageDashboard } from "../../_components/ManageDashboard";

export const metadata: Metadata = {
  title: "Manage Group — GainForest",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ didOrHandle: string }>;
};

export default async function ManageGroupPage({ params }: PageProps) {
  const { didOrHandle: rawIdentifier } = await params;
  const identifier = safeDecode(rawIdentifier);
  const did = identifier.startsWith("did:")
    ? identifier
    : await resolveIdentifierToDid(identifier).catch(() => null);

  if (!did?.startsWith("did:")) notFound();

  const account = await getAccountRouteData(did, identifier);
  const basePath = `/manage/groups/${rawIdentifier}`;
  return <ManageDashboard account={account} basePath={basePath} writeRepoDid={did} />;
}

function safeDecode(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}
