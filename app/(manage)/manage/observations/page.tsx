import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { RecordExplorer } from "@/app/_components/RecordExplorer";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import Container from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Manage Observations — GainForest",
  description: "Browse biodiversity observations published by your organization.",
  robots: { index: false, follow: false },
};

export default async function ManageObservationsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);
  if (account.kind !== "organization") notFound();

  return (
    <Container className="pt-4 pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-medium">Observations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review occurrence records attached to this organization.</p>
      </div>
      <Suspense fallback={null}>
        <RecordExplorer kind="occurrence" ownerDid={session.did} showHero={false} />
      </Suspense>
    </Container>
  );
}
