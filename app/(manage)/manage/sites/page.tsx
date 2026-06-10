import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { SitesClient } from "./_components/SitesClient";

export const metadata: Metadata = {
  title: "Manage Sites — GainForest",
  description: "Manage your certified field locations.",
  robots: { index: false, follow: false },
};

export default async function SitesPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;
  return <SitesClient did={session.did} />;
}
