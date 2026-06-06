import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { NewBumicertClient } from "./_components/NewBumicertClient";

export const metadata: Metadata = {
  title: "New Bumicert — Manage",
  description: "Create a new Bumicert.",
  robots: { index: false, follow: false },
};

export default async function NewBumicertPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  return <NewBumicertClient did={session.did} />;
}
