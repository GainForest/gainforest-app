import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { RichText } from "../../_components/RichText";
import { RecordExplorer } from "../../_components/RecordExplorer";
import { AccountBumicertsGrid } from "./AccountBumicertsGrid";
import { AccountContentColumns, AccountSidebar } from "./AccountSidebar";
import { AccountSettingsSections } from "./AccountSettingsSections";
import { DonationHistory } from "./DonationHistory";
import { TimelineMotion } from "./TimelineMotion";
import { fetchReceipts } from "../../_lib/dashboard";
import { fetchBumicertsByDid } from "../../_lib/indexer";
import type { AccountRouteData } from "../_lib/account-route";

type ManageAction = {
  href: string;
  label: string;
  description: string;
};

function ManageActionRow({ action }: { action?: ManageAction | null }) {
  if (!action) return null;

  return (
    <Link
      href={action.href}
      className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-sm transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{action.label}</span>
        <span className="mt-0.5 block text-muted-foreground">{action.description}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function AccountHomeTabContent({ account }: { account: AccountRouteData }) {
  if (!account.detail?.richBody?.length && !account.detail?.blurb) return null;

  return (
    <section className="py-1 md:py-2 org-animate org-fade-in-up org-delay-1">
      {account.detail?.richBody?.length ? (
        <RichText blocks={account.detail.richBody} />
      ) : (
        <p className="mt-5 max-w-3xl text-[14px] leading-[1.62] text-foreground/80">
          {account.detail?.blurb}
        </p>
      )}
    </section>
  );
}

export async function AccountBumicertsTabContent({
  account,
  did,
  manageAction,
}: {
  account: AccountRouteData;
  did: string;
  manageAction?: ManageAction | null;
}) {
  const [bumicerts, receipts] = await Promise.all([
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchReceipts().catch(() => []),
  ]);
  const donationCount = receipts.filter((receipt) =>
    account.kind === "organization"
      ? receipt.orgDid === did
      : receipt.from?.type === "did" && receipt.from.id === did,
  ).length;

  return (
    <AccountContentColumns
      sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={donationCount} />}
    >
      <ManageActionRow action={manageAction} />
      <AccountBumicertsGrid bumicerts={bumicerts} organizationName={account.displayName} logoUrl={account.avatarUrl} />
    </AccountContentColumns>
  );
}

export async function AccountDonationsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "user") {
    notFound();
  }

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

export function AccountObservationsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "organization") {
    notFound();
  }

  return <RecordExplorer kind="occurrence" ownerDid={did} showHero={false} />;
}

export async function AccountTimelineTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "organization") {
    notFound();
  }

  const entries = await fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []);
  const linkedWindow = entries.length ? formatLinkedWindow(entries.map((entry) => entry.createdAt)) : null;

  return (
    <TimelineMotion>
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/50 bg-background p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl tracking-tight text-foreground">
                Linked evidence
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {entries.length} linked items{linkedWindow ? ` · ${linkedWindow}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Evidence attached to this organization appears here.
              </p>
            </div>
            {linkedWindow ? (
              <p className="text-xs text-muted-foreground">
                {linkedWindow}
              </p>
            ) : null}
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
          <>
            <div className="space-y-3">
              {entries.slice(0, 25).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">{entry.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.shortDescription ?? "Bumicert story activity"}</p>
                </div>
              ))}
            </div>
            {entries.length > 25 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">Page 1 of {Math.ceil(entries.length / 25)}</p>
                <div className="flex items-center gap-1">
                  <button type="button" disabled aria-label="Previous page" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Next page" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TimelineMotion>
  );
}

export function AccountSettingsTabContent({ account }: { account: AccountRouteData }) {
  return <AccountSettingsSections did={account.did} />;
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
