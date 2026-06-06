import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import Container from "@/components/ui/container";
import { fetchBumicertsByDid } from "@/app/_lib/indexer";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { ManageBumicertsClient } from "./_components/ManageBumicertsClient";
import { ManageAccountTabs } from "../_components/ManageAccountTabs";

export const metadata: Metadata = {
  title: "Manage Bumicerts — Bumicerts",
  description: "Review your recent Bumicerts and drafts.",
  robots: { index: false, follow: false },
};

export default async function ManageBumicertsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);

  try {
    const page = await fetchBumicertsByDid(session.did, 24);
    return (
      <>
        <Container className="pt-4">
          <ManageAccountTabs account={account} />
        </Container>
        <ManageBumicertsClient did={session.did} bumicerts={page.records} />
      </>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recent Bumicerts.";
    return (
      <>
        <Container className="pt-4">
          <ManageAccountTabs account={account} />
        </Container>
        <ManageBumicertsClient did={session.did} bumicerts={[]} error={message} />
      </>
    );
  }
}
