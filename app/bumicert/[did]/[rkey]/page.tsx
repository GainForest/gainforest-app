import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ExternalLinkIcon,
  MapPinnedIcon,
  SproutIcon,
  UsersIcon,
} from "lucide-react";
import { AuthorChip } from "../../../_components/AuthorChip";
import { RichText } from "../../../_components/RichText";
import { SocialGlyph } from "../../../_components/SocialIcon";
import { formatDate, formatNumber, shortAtUri } from "../../../_lib/format";
import { fetchRecordByUri, fetchRecordDetail, type BumicertRecord, type DetailBadge } from "../../../_lib/indexer";
import { isPdsBlobUrl } from "../../../_lib/pds";
import { bumicertHref, hyperscanRecordHref, localBumicertHref } from "../../../_lib/urls";
import { getAccountRouteData, readAccountRouteParams } from "../../../account/_lib/account-route";

export const revalidate = 60;

type BumicertPageParams = Promise<{ did: string; rkey: string }>;

type RouteData = {
  record: BumicertRecord;
  detail: Awaited<ReturnType<typeof fetchRecordDetail>>;
  owner: Awaited<ReturnType<typeof getAccountRouteData>>;
  urlIdentifier: string;
};

const BADGE_TONE: Record<DetailBadge["tone"], string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  down: "bg-down/15 text-down",
  info: "bg-foreground/[0.06] text-foreground/70",
};

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

export default async function BumicertDetailPage({ params }: { params: BumicertPageParams }) {
  const { record, detail, owner, urlIdentifier } = await readRouteData(params);
  const externalHref = bumicertHref(record.did, record.rkey);
  const rawHref = hyperscanRecordHref(record.atUri);
  const period = record.startDate || record.endDate
    ? `${record.startDate ? formatDate(record.startDate) : "—"} → ${record.endDate ? formatDate(record.endDate) : "—"}`
    : "Not specified";
  const description = detail?.blurb ?? record.shortDescription;

  return (
    <main className="-mt-14 min-h-screen bg-background pb-20">
      <section className="relative isolate overflow-hidden border-b border-border-soft">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_30%),radial-gradient(circle_at_80%_0%,color-mix(in_oklab,var(--brand)_18%,transparent),transparent_34%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-b from-transparent to-background" />

        <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-12 pt-[92px] lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
          <div className="flex min-w-0 flex-col justify-end">
            <Link
              href="/bumicerts"
              className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/70 px-3.5 py-2 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Bumicerts
            </Link>

            <div className="mb-4 flex items-center gap-2.5">
              <SproutIcon className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Bumicert record
              </span>
            </div>
            <h1
              className="max-w-4xl text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl"
              style={{ fontFamily: "var(--font-garamond-var)" }}
            >
              {record.title}
            </h1>
            {record.shortDescription && (
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                {record.shortDescription}
              </p>
            )}

            <div className="mt-7 max-w-xl rounded-2xl border border-border-soft bg-background/72 p-3.5 shadow-sm backdrop-blur">
              <AuthorChip did={record.did} createdAt={record.createdAt} avatarOverride={owner.avatarUrl} />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/8 blur-2xl" />
            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-xl">
              <div className="relative aspect-[4/3] bg-muted">
                {record.imageUrl ? (
                  <Image
                    src={record.imageUrl}
                    alt={record.title}
                    fill
                    priority
                    sizes="(min-width: 1024px) 380px, 100vw"
                    unoptimized={!isPdsBlobUrl(record.imageUrl)}
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground">
                    <SproutIcon className="h-10 w-10 opacity-40" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-px bg-border-soft">
                <Metric icon={<UsersIcon />} label="Contributors" value={formatNumber(record.contributorCount)} />
                <Metric icon={<MapPinnedIcon />} label="Certified sites" value={formatNumber(record.locationCount)} />
                <Metric icon={<CalendarDaysIcon />} label="Period" value={period} wide />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 pt-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <article className="min-w-0 rounded-[1.5rem] border border-border bg-card px-5 py-6 shadow-sm md:px-8 md:py-8">
          {detail?.badges && detail.badges.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {detail.badges.map((badge, index) => (
                <Badge key={`${badge.label}-${index}`} badge={badge} />
              ))}
            </div>
          )}

          {detail?.richBody && detail.richBody.length > 0 ? (
            <RichText blocks={detail.richBody} />
          ) : description ? (
            <p className="whitespace-pre-line text-[15px] leading-8 text-foreground/76">{description}</p>
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
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-medium text-foreground">Record links</h2>
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton href={externalHref} external label="View on Bumicerts" />
              {rawHref && <LinkButton href={rawHref} external label="Raw ATProto data" />}
              <LinkButton href={`/account/${encodeURIComponent(urlIdentifier)}`} label="Owner account" />
              <LinkButton href="/bumicerts" label="Explore all Bumicerts" />
              {detail?.links?.map((link) => (
                <LinkButton key={link.href} href={link.href} external label={link.label} />
              ))}
            </div>
          </div>

          {detail?.socials && detail.socials.length > 0 && (
            <div className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-medium text-foreground">Organization links</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {detail.socials.map((social) => (
                  <Link
                    key={social.href}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    title={socialPlatformLabel(social.platform)}
                    aria-label={socialPlatformLabel(social.platform)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-border-soft text-foreground/60 transition-colors hover:border-primary/40 hover:bg-surface hover:text-primary"
                  >
                    <SocialGlyph platform={social.platform} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-medium text-foreground">AT Protocol URI</h2>
            <p className="mt-3 break-all rounded-xl border border-border-soft bg-surface-sunken px-3 py-2 font-mono text-[11px] leading-5 text-primary">
              {shortAtUri(record.atUri)}
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Full URI: <span className="break-all font-mono text-foreground/70">{record.atUri}</span>
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

async function readRouteData(params: BumicertPageParams): Promise<RouteData> {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const atUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`;
  const [record, detail, owner] = await Promise.all([
    fetchRecordByUri(atUri),
    fetchRecordDetail(atUri).catch(() => null),
    getAccountRouteData(did, urlIdentifier),
  ]);

  if (!record || record.kind !== "bumicert") notFound();
  return { record, detail, owner, urlIdentifier };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Metric({
  icon,
  label,
  value,
  wide = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`bg-card p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="mb-2 flex items-center gap-2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className="text-sm font-medium leading-6 text-foreground">{value}</div>
    </div>
  );
}

function Badge({ badge }: { badge: DetailBadge }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${BADGE_TONE[badge.tone]}`}>
      {badge.label}
    </span>
  );
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

function LinkButton({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group flex items-center justify-between rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
    >
      <span>{label}</span>
      {external ? (
        <ExternalLinkIcon className="h-3.5 w-3.5 text-foreground/35 transition-colors group-hover:text-primary" />
      ) : (
        <span aria-hidden className="text-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
          →
        </span>
      )}
    </Link>
  );
}
