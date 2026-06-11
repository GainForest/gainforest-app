import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchBumicertsByDid } from "@/app/_lib/indexer";
import { ManageProjectsClient } from "./_components/ManageProjectsClient";

export const metadata: Metadata = {
  title: "Manage Projects — GainForest",
  description: "Create and manage project collections for your Bumicerts.",
  robots: { index: false, follow: false },
};

export default async function ManageProjectsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;
  const bumicerts = await fetchBumicertsByDid(session.did, 500).then((page) => page.records).catch(() => []);
  return (
    <Suspense fallback={null}>
      <ManageProjectsClient bumicerts={bumicerts} />
    </Suspense>
  );
}
