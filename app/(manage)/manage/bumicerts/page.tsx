import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchBumicertsByDid } from "@/app/_lib/indexer";
import { ManageBumicertsClient } from "./_components/ManageBumicertsClient";

export const metadata: Metadata = {
  title: "Manage Bumicerts — Bumicerts",
  description: "Review your recent Bumicerts and drafts.",
  robots: { index: false, follow: false },
};

export default async function ManageBumicertsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  try {
    const page = await fetchBumicertsByDid(session.did, 24);
    return <ManageBumicertsClient did={session.did} ownerIdentifier={session.handle || session.did} bumicerts={page.records} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recent Bumicerts.";
    return <ManageBumicertsClient did={session.did} ownerIdentifier={session.handle || session.did} bumicerts={[]} error={message} />;
  }
}
