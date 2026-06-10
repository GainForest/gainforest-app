import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { TreesPageClient } from "./_components/TreesPageClient";

export const metadata: Metadata = {
  title: "Manage Trees — GainForest",
  description: "Manage tree groups and nature information.",
  robots: { index: false, follow: false },
};

export default async function TreesPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;
  return <TreesPageClient did={session.did} />;
}
