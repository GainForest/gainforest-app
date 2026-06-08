import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  AccountBumicertsTabContent,
  AccountDonationsTabContent,
  AccountHomeTabContent,
  AccountObservationsTabContent,
  AccountSettingsTabContent,
} from "@/app/account/_components/AccountTabContent";
import { getAccountRouteData, type AccountRouteData } from "@/app/account/_lib/account-route";

export const metadata: Metadata = {
  title: "Manage Organization — Bumicerts",
  description: "Manage your Bumicerts organization profile and data.",
};

type ManagePageSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type ManageTab = "home" | "bumicerts" | "donations" | "observations" | "settings";

export default async function ManagePage({ searchParams }: { searchParams: ManagePageSearchParams }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const [account, resolvedSearchParams] = await Promise.all([
    getAccountRouteData(session.did, session.did),
    searchParams,
  ]);
  const rawTab = normalizeManageTabParam(resolvedSearchParams.tab);
  if (account.kind === "organization" && rawTab === "timeline") {
    redirect("/manage?tab=observations");
  }
  const tab = resolveManageTab(account, rawTab);

  switch (tab) {
    case "bumicerts":
      return (
        <AccountBumicertsTabContent
          account={account}
          did={session.did}
          manageAction={{
            href: "/manage/bumicerts",
            label: "Manage your Bumicerts",
            description: "Create, edit, and review your Bumicert stories.",
          }}
        />
      );
    case "donations":
      return <AccountDonationsTabContent account={account} did={session.did} />;
    case "observations":
      return <AccountObservationsTabContent account={account} did={session.did} />;
    case "settings":
      return <AccountSettingsTabContent account={account} />;
    case "home":
      return <AccountHomeTabContent account={account} />;
  }
}

function normalizeManageTabParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveManageTab(account: AccountRouteData, tab: string | undefined): ManageTab {
  if (account.kind === "user") {
    switch (tab) {
      case "donations":
      case "settings":
      case "bumicerts":
        return tab;
      default:
        return "bumicerts";
    }
  }

  switch (tab) {
    case "bumicerts":
    case "observations":
    case "settings":
    case "home":
      return tab;
    default:
      return "home";
  }
}
