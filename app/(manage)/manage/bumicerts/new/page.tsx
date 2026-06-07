import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { NewBumicertClient } from "./_components/NewBumicertClient";

export const metadata: Metadata = {
  title: "New Bumicert — Manage",
  description: "Create a new Bumicert.",
  robots: { index: false, follow: false },
};

export default async function NewBumicertPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);
  return <NewBumicertClient did={session.did} profile={{ name: account.displayName, avatarUrl: account.avatarUrl }} />;
}
