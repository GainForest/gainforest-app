import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BanIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  HeartIcon,
  MapPinnedIcon,
  SproutIcon,
} from "lucide-react";
import { BumicertsBumicertCard } from "@/components/bumicert/BumicertsBumicertCard";
import { RichText } from "../../../_components/RichText";
import { SocialGlyph } from "../../../_components/SocialIcon";
import { fetchReceipts, type DonorRef, type FundingReceipt } from "../../../_lib/dashboard";
import { formatCompactUsd, formatDate, formatDateTime, formatNumber, formatRelative, formatUsd } from "../../../_lib/format";
import {
  fetchBumicertsByDid,
  fetchImageOccurrencesByDid,
  fetchRecordByUri,
  fetchRecordDetail,
  type BumicertRecord,
  type DetailBadge,
  type OccurrenceRecord,
} from "../../../_lib/indexer";
import { isPdsBlobUrl } from "../../../_lib/pds";
import { blockExplorerUrl, INDEXER_URL, localBumicertHref } from "../../../_lib/urls";
import { fetchAuthSession } from "../../../_lib/auth-server";
import { getAccountRouteData, readAccountRouteParams } from "../../../account/_lib/account-route";
import { Separator } from "@/components/ui/separator";
import { BumicertHeaderTitleBridge } from "./_components/BumicertHeaderTitleBridge";
import { BumicertShareButton } from "./_components/BumicertShareButton";
import { BumicertObservationsGallery } from "./_components/BumicertObservationsGallery";
import { DonateButton } from "./_components/donate/DonateButton";

export const revalidate = 60;

type BumicertPageParams = Promise<{ did: string; rkey: string }>;
type BumicertSearchParams = Promise<{ tab?: string | string[] }>;

type FundingConfigStatus = "open" | "coming-soon" | "paused" | "closed" | null;

type BumicertFundingConfig = {
  receivingWallet: { uri: string } | null;
  status: FundingConfigStatus;
  goalInUSD: string | null;
  minDonationInUSD: string | null;
  maxDonationInUSD: string | null;
} | null;

type RouteData = {
  record: BumicertRecord;
  detail: Awaited<ReturnType<typeof fetchRecordDetail>>;
  owner: Awaited<ReturnType<typeof getAccountRouteData>>;
  fundingConfig: BumicertFundingConfig;
  authSession: Awaited<ReturnType<typeof fetchAuthSession>>;
  urlIdentifier: string;
};

const BADGE_TONE: Record<DetailBadge["tone"], string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  down: "bg-down/15 text-down",
  info: "bg-foreground/[0.06] text-foreground/70",
};

const BUMICERT_DETAIL_TABS = ["overview", "site-boundaries", "donations", "timeline"] as const;
type BumicertDetailTab = (typeof BUMICERT_DETAIL_TABS)[number];

export async function generateMetadata({ params }: { params: BumicertPageParams }): Promise<Metadata> {
  const { record, owner, urlIdentifier } = await readRouteData(params);
  const description = record.shortDescription ?? `Bumicert published by ${owner.displayName}.`;
  return {
    title: `${record.title} — Bumicert`,
    description,
    alternates: { canonical: localBumicertHref(urlIdentifier, record.rkey) },
    openGraph: {
      title: record.title,
      description,
      type: "article",
      images: record.imageUrl ? [{ url: record.imageUrl }] : undefined,
    },
  };
}

export default async function BumicertDetailPage({
  params,
  searchParams,
}: {
  params: BumicertPageParams;
  searchParams: BumicertSearchParams;
}) {
  const [{ record, detail, owner, fundingConfig, authSession, urlIdentifier }, search] = await Promise.all([
    readRouteData(params),
    searchParams,
  ]);
  const activeTab = parseDetailTab(search.tab);
  const detailHref = localBumicertHref(urlIdentifier, record.rkey);
  const period = record.startDate || record.endDate
    ? `${record.startDate ? formatDate(record.startDate) : "—"} → ${record.endDate ? formatDate(record.endDate) : "—"}`
    : "Not specified";
  const description = detail?.blurb ?? record.shortDescription;

  let donationReceipts: FundingReceipt[] = [];
  let donationsUnavailable = false;
  if (activeTab === "overview" || activeTab === "donations") {
    try {
      donationReceipts = (await fetchReceipts()).filter((receipt) => receipt.bumicertUri === record.atUri);
    } catch (error) {
      console.warn("Unable to load Bumicert donations", record.atUri, error);
      donationsUnavailable = true;
    }
  }

  const isOverviewTab = activeTab === "overview";
  const [moreBumicerts, observations] = isOverviewTab
    ? await Promise.all([
        fetchBumicertsByDid(record.did, 6)
          .then((page) => page.records.filter((item) => item.id !== record.id).slice(0, 5))
          .catch(() => []),
        fetchImageOccurrencesByDid(record.did, 24).catch(() => []),
      ])
    : [[], [] as OccurrenceRecord[]];

  return (
    <>
      <BumicertHeaderTitleBridge
        summary={{
          title: record.title,
          donateHref: detailHref,
          card: {
            did: record.did,
            title: record.title,
            shortDescription: record.shortDescription,
            imageUrl: record.imageUrl,
            locationCount: record.locationCount,
            contributorCount: record.contributorCount,
            startDate: record.startDate,
            endDate: record.endDate,
          },
        }}
      />
      <main className="min-h-screen bg-background pb-20">
        <section className={`mx-auto max-w-6xl gap-8 px-6 py-8 lg:px-8 ${isOverviewTab ? "grid lg:grid-cols-[320px_minmax(0,1fr)]" : ""}`}>
          {isOverviewTab && (
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <OverviewSidebar
                record={record}
                detail={detail}
                owner={owner}
                receipts={donationReceipts}
                donationsUnavailable={donationsUnavailable}
                fundingConfig={fundingConfig}
                authSession={authSession}
              />
            </aside>
          )}

          <div className="min-w-0">
            {activeTab === "overview" && (
              <OverviewPanel
                record={record}
                detail={detail}
                description={description}
                observations={observations}
              />
            )}
            {activeTab === "site-boundaries" && <SiteBoundariesPanel record={record} />}
            {activeTab === "donations" && (
              <DonationsPanel receipts={donationReceipts} unavailable={donationsUnavailable} />
            )}
            {activeTab === "timeline" && <TimelinePanel record={record} detail={detail} period={period} />}
          </div>

          {isOverviewTab && moreBumicerts.length > 0 ? (
            <MoreBumicertsSection
              bumicerts={moreBumicerts}
              owner={owner}
            />
          ) : null}
        </section>
      </main>
    </>
  );
}

async function readRouteData(params: BumicertPageParams): Promise<RouteData> {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const atUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`;
  const [record, detail, owner, fundingConfig, authSession] = await Promise.all([
    fetchRecordByUri(atUri),
    fetchRecordDetail(atUri).catch(() => null),
    getAccountRouteData(did, urlIdentifier),
    fetchBumicertFundingConfig(did, rkey).catch(() => null),
    fetchAuthSession(),
  ]);

  if (!record || record.kind !== "bumicert") notFound();
  return { record, detail, owner, fundingConfig, authSession, urlIdentifier };
}

async function fetchBumicertFundingConfig(did: string, rkey: string): Promise<BumicertFundingConfig> {
  const uri = `at://${did}/app.gainforest.funding.config/${rkey}`;
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `
        query BumicertsBumicertFundingConfig($uri: String!) {
          appGainforestFundingConfigByUri(uri: $uri) {
            receivingWallet { ... on AppGainforestFundingConfigEvmLinkRef { uri } }
            status
            goalInUSD
            minDonationInUSD
            maxDonationInUSD
          }
        }
      `,
      variables: { uri },
    }),
    next: { revalidate },
  });

  const json = (await response.json()) as {
    data?: {
      appGainforestFundingConfigByUri?: {
        receivingWallet?: { uri?: string | null } | null;
        status?: string | null;
        goalInUSD?: string | null;
        minDonationInUSD?: string | null;
        maxDonationInUSD?: string | null;
      } | null;
    };
  };

  const node = json.data?.appGainforestFundingConfigByUri;
  if (!node) return null;

  return {
    receivingWallet: node.receivingWallet?.uri ? { uri: node.receivingWallet.uri } : null,
    status: normalizeFundingStatus(node.status),
    goalInUSD: node.goalInUSD ?? null,
    minDonationInUSD: node.minDonationInUSD ?? null,
    maxDonationInUSD: node.maxDonationInUSD ?? null,
  };
}

function normalizeFundingStatus(status: string | null | undefined): FundingConfigStatus {
  if (status === "coming-soon" || status === "paused" || status === "closed") return status;
  if (status === "open" || status == null) return "open";
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDetailTab(value: string | string[] | undefined): BumicertDetailTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return BUMICERT_DETAIL_TABS.includes(raw as BumicertDetailTab) ? (raw as BumicertDetailTab) : "overview";
}

function polygonsViewHref(locationUri: string): string {
  return `https://polygons-gainforest.vercel.app/view?${new URLSearchParams({
    certifiedLocationRecordUri: locationUri,
  }).toString()}`;
}

function OverviewSidebar({
  record,
  detail,
  owner,
  receipts,
  donationsUnavailable,
  fundingConfig,
  authSession,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  owner: RouteData["owner"];
  receipts: FundingReceipt[];
  donationsUnavailable: boolean;
  fundingConfig: BumicertFundingConfig;
  authSession: RouteData["authSession"];
}) {
  const orgLinks = buildOrganizationLinks(owner, detail);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/account/${encodeURIComponent(owner.urlIdentifier)}`} className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {owner.avatarUrl ? (
            <Image
              src={owner.avatarUrl}
              alt={owner.displayName}
              fill
              sizes="36px"
              unoptimized={!isPdsBlobUrl(owner.avatarUrl)}
              className="object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs font-semibold text-muted-foreground">
              {owner.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>
        <Link href={`/account/${encodeURIComponent(owner.urlIdentifier)}`} className="group flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium leading-tight text-foreground transition-colors group-hover:text-primary">
            {owner.displayName}
          </span>
          <span className="text-xs leading-tight text-muted-foreground">{formatRelative(record.createdAt)}</span>
        </Link>
        <BumicertShareButton />
      </div>

      <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-3xl border border-border bg-muted">
        {record.imageUrl ? (
          <Image
            src={record.imageUrl}
            alt={record.title}
            fill
            priority
            sizes="(min-width: 1024px) 320px, 100vw"
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <SproutIcon className="h-10 w-10 opacity-40" />
          </div>
        )}
      </div>

      <Separator />

      <AboutOrganizationSection owner={owner} links={orgLinks} />

      <Separator />

      <SidebarDonations
        record={record}
        owner={owner}
        receipts={receipts}
        unavailable={donationsUnavailable}
        fundingConfig={fundingConfig}
        authSession={authSession}
      />
    </div>
  );
}

function AboutOrganizationSection({
  owner,
  links,
}: {
  owner: RouteData["owner"];
  links: OrganizationLinkItem[];
}) {
  const accountHref = `/account/${encodeURIComponent(owner.urlIdentifier)}`;
  const allLinks: OrganizationLinkItem[] = [
    ...links,
    {
      href: accountHref,
      platform: "link",
      label: "Learn More",
      description: `View ${owner.displayName}'s full profile.`,
      external: false,
    },
  ];
  const learnMoreIsFullWidth = allLinks.length % 2 === 1;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
        About {owner.displayName}
      </h3>
      {owner.description ? (
        <p className="line-clamp-5 text-sm leading-6 text-foreground/70">{owner.description}</p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {owner.displayName} is the organization behind this Bumicert.
        </p>
      )}
      {owner.country ? (
        <dl className="text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Country</dt>
            <dd className="truncate text-foreground">{owner.country}</dd>
          </div>
        </dl>
      ) : null}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {allLinks.map((link, index) => {
          const isLearnMore = index === allLinks.length - 1;
          const isExternal = link.external !== false;
          return (
            <Link
              key={`${link.platform}-${link.href}`}
              href={link.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer" : undefined}
              className={`group inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-full border border-border-soft bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-primary ${isLearnMore && learnMoreIsFullWidth ? "col-span-2" : ""}`}
            >
              <SocialGlyph platform={link.platform} />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarDonations({
  record,
  owner,
  receipts,
  unavailable,
  fundingConfig,
  authSession,
}: {
  record: BumicertRecord;
  owner: RouteData["owner"];
  receipts: FundingReceipt[];
  unavailable: boolean;
  fundingConfig: BumicertFundingConfig;
  authSession: RouteData["authSession"];
}) {
  const usdReceipts = receipts.filter((receipt) => ["USD", "USDC"].includes(receipt.currency.toUpperCase()));
  const totalUsd = usdReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const hasReceipts = receipts.length > 0;
  const donationStatus = getDonationStatus(fundingConfig, unavailable);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Donations
      </h3>
      <div className="flex items-center gap-2 text-sm">
        {donationStatus.kind === "open" ? (
          <CircleDotIcon className="h-3.5 w-3.5 text-primary" />
        ) : (
          <BanIcon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className={donationStatus.kind === "open" ? "text-primary" : "text-muted-foreground"}>
          {donationStatus.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Raised</p>
          <p className="mt-0.5 text-lg font-medium text-foreground">{formatCompactUsd(totalUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Completed gifts</p>
          <p className="mt-0.5 text-lg font-medium text-foreground">{formatNumber(receipts.length)}</p>
        </div>
      </div>
      <DonateButton
        bumicert={{
          organizationDid: record.did,
          rkey: record.rkey,
          title: record.title,
          organizationName: owner.displayName,
        }}
        fundingConfig={fundingConfig}
        authSession={authSession}
        disabled={donationStatus.kind !== "open"}
        label={donationStatus.kind === "open" && hasReceipts ? "Donate again" : "Donate"}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        Completed donations appear publicly so supporters can see the impact.
      </p>
    </div>
  );
}

function getDonationStatus(
  fundingConfig: BumicertFundingConfig,
  unavailable: boolean,
): { kind: "open" | "unavailable" | "not-applicable" | "inactive"; label: string } {
  if (unavailable) return { kind: "unavailable", label: "Donation status unavailable" };
  if (!fundingConfig || !fundingConfig.receivingWallet?.uri) {
    return { kind: "not-applicable", label: "Donations are not applicable" };
  }
  const status = fundingConfig.status ?? "open";
  if (status === "open") return { kind: "open", label: "Accepting donations" };
  if (status === "coming-soon") return { kind: "inactive", label: "Donations coming soon" };
  if (status === "paused") return { kind: "inactive", label: "Donations paused" };
  if (status === "closed") return { kind: "inactive", label: "Donations closed" };
  return { kind: "unavailable", label: "Donation status unavailable" };
}

type OrganizationLinkItem = {
  href: string;
  platform: string;
  label: string;
  description: string;
  external?: boolean;
};

function buildOrganizationLinks(
  owner: RouteData["owner"],
  detail: RouteData["detail"],
): OrganizationLinkItem[] {
  const links: OrganizationLinkItem[] = [];
  const seen = new Set<string>();

  function add(item: OrganizationLinkItem) {
    if (seen.has(item.href)) return;
    seen.add(item.href);
    links.push(item);
  }

  if (owner.website) {
    add({
      href: owner.website,
      platform: "website",
      label: "Website",
      description: `Visit ${owner.displayName}'s main website at ${externalHost(owner.website)}.`,
    });
  }

  for (const social of detail?.socials ?? []) {
    add({
      href: social.href,
      platform: social.platform,
      label: socialPlatformLabel(social.platform),
      description: socialPlatformDescription(social.platform, owner.displayName, social.href),
    });
  }

  return links;
}

function socialPlatformDescription(platform: string, organizationName: string, href: string): string {
  const host = href.startsWith("mailto:") ? "email" : externalHost(href);
  const descriptions: Record<string, string> = {
    facebook: `Follow ${organizationName} on Facebook for public updates.`,
    instagram: `See field photos and updates from ${organizationName} on Instagram.`,
    youtube: `Watch videos and project stories from ${organizationName}.`,
    linkedin: `View ${organizationName}'s professional updates on LinkedIn.`,
    x: `Follow short updates from ${organizationName} on X.`,
    telegram: `Open ${organizationName}'s Telegram channel or community.`,
    tiktok: `Watch short-form updates from ${organizationName}.`,
    github: `See public project updates from ${organizationName}.`,
    bluesky: `Follow ${organizationName} on Bluesky.`,
    discord: `Join ${organizationName}'s Discord community.`,
    email: `Contact ${organizationName} by email.`,
    website: `Open ${organizationName}'s website at ${host}.`,
    link: `Open this external resource from ${organizationName}.`,
  };
  return descriptions[platform] ?? `Open ${host} for more from ${organizationName}.`;
}

function Badge({ badge }: { badge: DetailBadge }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium ${BADGE_TONE[badge.tone]}`}>
      {badge.label}
    </span>
  );
}

function OverviewPanel({
  record,
  detail,
  description,
  observations,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  description: string | null | undefined;
  observations: OccurrenceRecord[];
}) {
  return (
    <article className="py-1">
      <h1
        className="max-w-3xl text-4xl font-light italic leading-tight tracking-[-0.035em] text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-instrument-serif-var)" }}
      >
        {record.title}
      </h1>

      {detail?.badges && detail.badges.length > 0 && (
        <div className="mb-6 mt-6 flex flex-wrap gap-2.5">
          {detail.badges.map((badge, index) => (
            <Badge key={`${badge.label}-${index}`} badge={badge} />
          ))}
        </div>
      )}

      {detail?.richBody && detail.richBody.length > 0 ? (
        <RichText blocks={detail.richBody} className="text-lg leading-8 md:text-xl md:leading-9" />
      ) : description ? (
        <p className="mt-6 whitespace-pre-line text-lg leading-8 text-foreground/76 md:text-xl md:leading-9">{description}</p>
      ) : (
        <p className="text-[15px] leading-8 text-muted-foreground">
          No long-form description has been published for this Bumicert yet.
        </p>
      )}

      {detail?.sections?.map((section, index) =>
        section.fields.length === 0 ? null : (
          <div key={section.title ?? index} className="mt-8 border-t border-border-soft pt-6">
            {section.title && (
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {section.title}
              </h2>
            )}
            <dl className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.label} className={field.wide ? "sm:col-span-2" : undefined}>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">
                    {field.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ),
      )}

      <BumicertObservationsGallery observations={observations} />
    </article>
  );
}

function SiteBoundariesPanel({ record }: { record: BumicertRecord }) {
  const firstLocationUri = record.locationUris[0] ?? null;

  return (
    <article className="py-1">
      {firstLocationUri ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-muted/30">
            <iframe
              src={polygonsViewHref(firstLocationUri)}
              className="h-[420px] w-full border-0"
              title="Site boundaries map"
              loading="lazy"
            />
          </div>

          <div className="mt-5 grid gap-3">
            {record.locationUris.map((uri, index) => (
              <Link
                key={uri}
                href={polygonsViewHref(uri)}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
              >
                <span>Project place {index + 1}</span>
                <ExternalLinkIcon className="h-3.5 w-3.5 text-foreground/35 transition-colors group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<MapPinnedIcon className="h-8 w-8" />}
          title="No project places linked"
          body="This Bumicert does not currently include mapped project areas."
        />
      )}
    </article>
  );
}

function DonationsPanel({ receipts, unavailable }: { receipts: FundingReceipt[]; unavailable: boolean }) {
  const usdReceipts = receipts.filter((receipt) => ["USD", "USDC"].includes(receipt.currency.toUpperCase()));
  const totalUsd = usdReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const donorCount = new Set(receipts.map((receipt) => receipt.from?.id).filter(Boolean)).size;

  return (
    <article className="py-1">
      {unavailable ? (
        <EmptyState
          icon={<HeartIcon className="h-8 w-8" />}
          title="Donation information is unavailable"
          body="We could not load donations for this Bumicert. Try again later on this page."
        />
      ) : receipts.length === 0 ? (
        <EmptyState
          icon={<HeartIcon className="h-8 w-8" />}
          title="No donations yet"
          body="Completed donations for this Bumicert will appear here."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Total raised" value={formatCompactUsd(totalUsd)} />
            <StatCard label="Donations" value={formatNumber(receipts.length)} />
            <StatCard label="Donors" value={formatNumber(donorCount)} />
          </div>

          <div className="space-y-3">
            {receipts.map((receipt) => (
              <DonationRow key={receipt.uri} receipt={receipt} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function TimelinePanel({
  record,
  detail,
  period,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  period: string;
}) {
  const events = [
    {
      title: "Bumicert published",
      body: record.shortDescription ?? "This project story was published.",
      meta: formatDateTime(record.createdAt),
    },
    record.locationUris.length > 0
      ? {
          title: "Project places added",
          body: `${formatNumber(record.locationUris.length)} project place${record.locationUris.length === 1 ? "" : "s"} linked to this Bumicert.`,
          meta: "Project areas",
        }
      : null,
    record.startDate || record.endDate
      ? {
          title: "Activity period",
          body: period,
          meta: "Project timeline",
        }
      : null,
  ].filter((event): event is { title: string; body: string; meta: string } => event !== null);

  return (
    <article className="py-1">
      <div className="relative space-y-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-border-soft">
        {events.map((event) => (
          <div key={event.title} className="relative flex gap-4">
            <span className="mt-1 h-6 w-6 shrink-0 rounded-full border border-primary/30 bg-primary/10 ring-4 ring-card" />
            <div className="min-w-0 rounded-2xl border border-border-soft bg-surface p-4">
              <p className="text-sm font-medium text-foreground">{event.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.body}</p>
              <p className="mt-2 text-xs text-foreground/45">{event.meta}</p>
            </div>
          </div>
        ))}
      </div>

      {detail?.badges?.length ? (
        <div className="mt-6 border-t border-border-soft pt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            What this covers
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.badges.map((badge, index) => (
              <Badge key={`${badge.label}-${index}`} badge={badge} />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function MoreBumicertsSection({
  bumicerts,
  owner,
}: {
  bumicerts: BumicertRecord[];
  owner: RouteData["owner"];
}) {
  const viewAllHref = `/account/${encodeURIComponent(owner.urlIdentifier)}/bumicerts`;

  return (
    <section className="min-w-0 lg:col-span-2">
      <Separator className="my-2" />
      <div className="mb-4 flex items-center justify-between gap-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">More Bumicerts from this Organization</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{owner.displayName}</p>
        </div>
        <Link
          href={viewAllHref}
          className="shrink-0 rounded-full border border-border-soft px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary"
        >
          See all
        </Link>
      </div>
      <div
        className="flex gap-4 overflow-x-auto pb-2"
        style={{
          WebkitMaskImage: "linear-gradient(to right, black 0%, black calc(100% - 56px), transparent 100%)",
          maskImage: "linear-gradient(to right, black 0%, black calc(100% - 56px), transparent 100%)",
        }}
      >
        {bumicerts.map((item) => (
          <Link key={item.id} href={localBumicertHref(item.did, item.rkey)} className="block w-[260px] shrink-0">
            <BumicertsBumicertCard record={item} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function externalHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface px-3 py-3 sm:px-4">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:text-xs sm:tracking-[0.14em]">{label}</p>
      <p className="mt-1 text-lg font-medium text-foreground sm:text-xl">{value}</p>
    </div>
  );
}

function DonationRow({ receipt }: { receipt: FundingReceipt }) {
  const txHref = blockExplorerUrl(receipt.txHash, receipt.paymentNetwork);
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {formatDonationAmount(receipt)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            From {donorLabel(receipt.from)}
            {receipt.occurredAt || receipt.createdAt ? ` · ${formatDateTime(receipt.occurredAt ?? receipt.createdAt)}` : ""}
          </p>
        </div>
        {txHref ? (
          <Link
            href={txHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-full border border-border-soft px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary"
          >
            Payment details
            <ExternalLinkIcon className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-soft bg-surface/50 px-6 py-12 text-center">
      <div className="text-muted-foreground/50">{icon}</div>
      <h2 className="mt-4 text-lg font-medium text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function formatDonationAmount(receipt: FundingReceipt): string {
  if (["USD", "USDC"].includes(receipt.currency.toUpperCase())) return formatUsd(receipt.amount);
  return `${formatNumber(receipt.amount)} ${receipt.currency}`;
}

function donorLabel(donor: DonorRef): string {
  if (!donor) return "anonymous donor";
  if (donor.type === "wallet") return "anonymous supporter";
  return "named supporter";
}

function socialPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    x: "X",
    telegram: "Telegram",
    tiktok: "TikTok",
    github: "GitHub",
    bluesky: "Bluesky",
    discord: "Discord",
    email: "Email",
    website: "Website",
    link: "Link",
  };
  return labels[platform] ?? "Link";
}

