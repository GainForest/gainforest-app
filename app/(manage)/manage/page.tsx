import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import {
  fetchAudioByDid,
  fetchLocationsByDid,
  fetchProjectsByDid,
  fetchTreeDatasetsByDid,
} from "@/app/_lib/indexer";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { ManageOverview } from "./_components/ManageOverview";

export const metadata: Metadata = {
  title: "Manage — GainForest",
  description: "Manage your GainForest profile, records, groups, and settings.",
};

export default async function ManagePage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);

  const [receipts, projects, sites, trees, audio] = await Promise.all([
    fetchReceipts().catch(() => []),
    account.kind === "organization" ? fetchProjectsByDid(session.did, 500).then((page) => page.records).catch(() => []) : Promise.resolve([]),
    account.kind === "organization" ? fetchLocationsByDid(session.did).catch(() => []) : Promise.resolve([]),
    account.kind === "organization" ? fetchTreeDatasetsByDid(session.did).catch(() => []) : Promise.resolve([]),
    account.kind === "organization" ? fetchAudioByDid(session.did).catch(() => []) : Promise.resolve([]),
  ]);

  const donationCount = receipts.filter((receipt) =>
    account.kind === "organization"
      ? receipt.orgDid === session.did
      : receipt.from?.type === "did" && receipt.from.id === session.did,
  ).length;

  return (
    <ManageOverview
      account={account}
      stats={{
        bumicerts: account.summary.bumicertCount,
        donations: donationCount,
        observations: account.summary.observationCount,
        projects: projects.length,
        sites: sites.length,
        trees: trees.length,
        audio: audio.length,
      }}
    />
  );
}
