import type { Metadata } from "next";
import Container from "@/components/ui/container";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { ManageGroupsClient } from "../groups/_components/ManageGroupsClient";

export const metadata: Metadata = {
  title: "My Organizations — GainForest",
  robots: { index: false, follow: false },
};

export default async function ManageOrganizationsPage() {
  const session = await fetchAuthSession();

  return (
    <Container className="pt-4 pb-8">
      <div className="mb-6">
        <h1 className="font-instrument text-3xl font-light italic leading-tight tracking-[-0.02em] text-foreground">
          My Organizations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select an organization to manage it, or create a new one.
        </p>
      </div>
      <ManageGroupsClient sessionDid={session.isLoggedIn ? session.did : null} />
    </Container>
  );
}
