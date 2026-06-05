import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNotice } from "./_components/AccountNotice";
import { fetchAuthSession } from "../_lib/auth-server";
import { accountPath } from "./_lib/account-route";

export const metadata: Metadata = {
  title: "Account — Bumicerts",
  description: "Open your public GainForest/Bumicerts account profile.",
  robots: { index: false, follow: true },
};

export default async function AccountPage() {
  const session = await fetchAuthSession();

  if (session.isLoggedIn) {
    redirect(accountPath(session.did));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <AccountNotice
        title="Sign in to view your account"
        description="Your local Bumiscan account profile is created from public ATProto, Bumicerts, and GainForest records. Sign in from the account menu to open your own route."
        actionHref="/bumicerts"
        actionLabel="Explore Bumicerts"
      />
    </main>
  );
}
