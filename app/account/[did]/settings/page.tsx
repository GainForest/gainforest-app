import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchAuthSession } from "../../../_lib/auth-server";
import { readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Account settings moved — Bumicerts",
  description: "Account settings are managed from /manage.",
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did } = await readAccountRouteParams(params);
  const session = await fetchAuthSession();

  if (!session.isLoggedIn || session.did !== did) {
    notFound();
  }

  redirect("/manage/settings");
}
