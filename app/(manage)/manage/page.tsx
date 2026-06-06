import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import { fetchBumicertsByDid } from "@/app/_lib/indexer";
import { RichText } from "@/app/_components/RichText";
import { AccountContentColumns, AccountSidebar } from "@/app/account/_components/AccountSidebar";
import { AccountSettingsSections } from "@/app/account/_components/AccountSettingsSections";
import { DonationHistory } from "@/app/account/_components/DonationHistory";
import { TimelineMotion } from "@/app/account/_components/TimelineMotion";
import { getAccountRouteData, type AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageBumicertsClient } from "./bumicerts/_components/ManageBumicertsClient";
import { ManageNavGrid } from "./_components/ManageNavGrid";

export const metadata: Metadata = {
  title: "Manage Organization — Bumicerts",
  description: "Manage your Bumicerts organization profile and data.",
};

type ManagePageSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type ManageTab = "home" | "bumicerts" | "donations" | "timeline" | "settings";

export default async function ManagePage({ searchParams }: { searchParams: ManagePageSearchParams }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const [account, resolvedSearchParams] = await Promise.all([
    getAccountRouteData(session.did, session.did),
    searchParams,
  ]);
  const tab = resolveManageTab(account, resolvedSearchParams.tab);

  switch (tab) {
    case "bumicerts":
      return <ManageBumicertsTab did={session.did} />;
    case "donations":
      return <ManageDonationsTab account={account} did={session.did} />;
    case "timeline":
      return <ManageTimelineTab did={session.did} />;
    case "settings":
      return <AccountSettingsSections account={account} />;
    case "home":
      return <ManageHomeTab account={account} />;
  }
}

function resolveManageTab(account: AccountRouteData, value: string | string[] | undefined): ManageTab {
  const tab = Array.isArray(value) ? value[0] : value;

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
    case "timeline":
    case "settings":
    case "home":
      return tab;
    default:
      return "home";
  }
}

function ManageHomeTab({ account }: { account: AccountRouteData }) {
  return (
    <>
      {account.detail?.richBody?.length ? (
        <section className="py-6 md:py-8">
          <RichText blocks={account.detail.richBody} />
        </section>
      ) : account.description ? (
        <section className="py-6 md:py-8">
          <p className="max-w-3xl text-[14px] leading-[1.62] text-foreground/80">{account.description}</p>
        </section>
      ) : null}
      <ManageNavGrid accountKind={account.kind} />
    </>
  );
}

async function ManageBumicertsTab({ did }: { did: string }) {
  try {
    const page = await fetchBumicertsByDid(did, 24);
    return <ManageBumicertsClient did={did} bumicerts={page.records} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recent Bumicerts.";
    return <ManageBumicertsClient did={did} bumicerts={[]} error={message} />;
  }
}

async function ManageDonationsTab({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "user") notFound();

  const [receipts, bumicerts] = await Promise.all([
    fetchReceipts().catch(() => []),
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
  ]);
  const userDonations = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did);

  return (
    <AccountContentColumns sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={userDonations.length} />}>
      <section className="py-6">
        <DonationHistory receipts={userDonations} />
      </section>
    </AccountContentColumns>
  );
}

async function ManageTimelineTab({ did }: { did: string }) {
  const entries = await fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []);
  const linkedWindow = entries.length ? formatLinkedWindow(entries.map((entry) => entry.createdAt)) : null;

  return (
    <TimelineMotion>
      <div className="space-y-4 py-6">
        <div className="rounded-2xl border border-border/50 bg-background p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl tracking-tight text-foreground">Linked evidence</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {entries.length} linked items{linkedWindow ? ` · ${linkedWindow}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Evidence attached to this organization appears here.</p>
            </div>
            {linkedWindow ? <p className="text-xs text-muted-foreground">{linkedWindow}</p> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {["all", "image", "document", "link"].map((filter, index) => (
              <button
                key={filter}
                type="button"
                aria-pressed={index === 0}
                className={index === 0
                  ? "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors border-primary bg-primary text-primary-foreground"
                  : "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"}
              >
                {filter[0]!.toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
            No timeline evidence yet.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.slice(0, 25).map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-medium text-foreground">{entry.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{entry.shortDescription ?? "Bumicert story activity"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </TimelineMotion>
  );
}

function formatLinkedWindow(values: string[]): string | null {
  const dates = values.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return null;
  const first = dates.reduce((current, next) => next.getTime() < current.getTime() ? next : current);
  const last = dates.reduce((current, next) => next.getTime() > current.getTime() ? next : current);
  const format = (date: Date) => date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()
    ? format(first)
    : `${format(first)} – ${format(last)}`;
}
