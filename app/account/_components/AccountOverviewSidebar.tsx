import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BadgeCheckIcon } from "lucide-react";
import { AccountAwards } from "./AccountAwards";
import { AccountMemberships } from "./AccountMemberships";
import { AccountStatList, type AccountStatCounts } from "./AccountStatList";
import { AccountSupportCard } from "./AccountSupportCard";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { monogram } from "@/app/_lib/did-profile";
import { fetchAccountMaEarthRounds, fetchProjectImageGalleriesByDid } from "@/app/_lib/indexer";
import { fetchPublicDataCouncilMembers, type PublicDataCouncilMember } from "@/app/_lib/data-council";
import type { AccountRouteData } from "../_lib/account-route";
import { accountGalleryPath } from "../_lib/account-route";

/** Quiet section wrapper: a small label, then the section's content. */
function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A rail block that renders nothing until its own data arrives. Hiding it
 * while empty keeps the rail's dividers honest: an empty block would otherwise
 * leave a stray hairline behind.
 */
function QuietRailBlock({ children }: { children: React.ReactNode }) {
  return <section className="empty:hidden">{children}</section>;
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
      {label}
    </Link>
  );
}

/** A peek at the account's photo library, linking to the full gallery. */
async function PhotosCard({ account }: { account: AccountRouteData }) {
  const [t, overviewT, galleries] = await Promise.all([
    getTranslations("common.accountTabs"),
    getTranslations("common.accountOverview"),
    fetchProjectImageGalleriesByDid(account.did).catch(() => []),
  ]);

  const photos = galleries.flatMap((gallery) => gallery.images).filter((image) => Boolean(image.url)).slice(0, 6);
  if (photos.length === 0) return null;

  return (
    <SidebarSection
      title={t("photos")}
      action={<SidebarLink href={accountGalleryPath(account.urlIdentifier)} label={overviewT("seeAll")} />}
    >
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <Link
            key={photo.id}
            href={accountGalleryPath(account.urlIdentifier)}
            className="relative block aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition-opacity hover:opacity-90"
          >
            <Image src={photo.url} alt="" fill unoptimized sizes="96px" className="object-cover" />
          </Link>
        ))}
      </div>
    </SidebarSection>
  );
}

/** The Ma Earth funding rounds this organization took part in. */
async function MaEarthCard({ did }: { did: string }) {
  const [t, rounds] = await Promise.all([
    getTranslations("common.maEarthRounds"),
    fetchAccountMaEarthRounds(did).catch(() => [] as number[]),
  ]);
  if (rounds.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-background ring-1 ring-border/70">
          <Image
            src="/assets/media/images/badges/ma-earth-logo.webp"
            width={28}
            height={28}
            alt=""
            className="size-full object-contain"
          />
        </span>
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <ul className="flex flex-wrap gap-2">
        {rounds.map((round) => (
          <li
            key={round}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <BadgeCheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
            {t("round", { round })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DataCouncilAvatar({ member }: { member: PublicDataCouncilMember }) {
  const mono = monogram(member.displayName?.trim() || "Member", member.did);
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white">
      {member.avatarUrl ? (
        <Image src={member.avatarUrl} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span aria-hidden style={{ backgroundColor: mono.bg }} className="flex size-full items-center justify-center">
          {mono.char}
        </span>
      )}
    </span>
  );
}

/** The people who steward this organization's shared data. */
async function DataCouncilCard({ did }: { did: string }) {
  const [t, members] = await Promise.all([
    getTranslations("common.accountDataCouncil"),
    fetchPublicDataCouncilMembers(did).catch(() => []),
  ]);
  if (members.length === 0) return null;

  return (
    <SidebarSection title={t("title")}>
      <p className="text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.did} className="flex items-center gap-2.5">
            <DataCouncilAvatar member={member} />
            <span className="min-w-0 truncate text-sm text-foreground">
              {member.displayName?.trim() || t("memberFallback")}
            </span>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}

/**
 * The side rail of an account's Overview — the supporting details, not the
 * story: how to support the account, its numbers at a glance, and a peek at
 * its photos. The account's endorsement belongs in its hero; who it is and
 * what it runs lead the main column instead (see {@link AccountAboutSection}).
 *
 * Each block hides itself when it has nothing to show, so a brand-new profile
 * stays quiet instead of showing a wall of empty cards.
 */
export async function AccountOverviewSidebar({
  account,
  counts,
  receivedUsd,
  supporters,
  memberships,
}: {
  account: AccountRouteData;
  counts: AccountStatCounts;
  receivedUsd: number;
  supporters: number;
  memberships: AccountOrganization[];
}) {
  const organizationsT = await getTranslations("common.accountOrganizations");

  return (
    // Each block opens with its own hairline so the rail reads as a short stack
    // of labelled sections instead of one column of loose text. The first block
    // skips the rule — whatever sits above it (the tab bar beside the story, the
    // project list when stacked) already draws one. Stacked, the rail is also
    // capped, so a label and its number never sit half a screen apart.
    <div
      data-account-overview-panel
      className="max-w-md space-y-6 xl:max-w-none [&>*]:border-t [&>*]:border-border/60 [&>*]:pt-6 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0"
    >
      <AccountSupportCard
        did={account.did}
        name={account.displayName}
        image={account.avatarUrl}
        receivedUsd={receivedUsd}
        supporters={supporters}
      />

      <AccountStatList identifier={account.urlIdentifier} counts={counts} />

      <PhotosCard account={account} />
      {account.kind === "organization" ? <MaEarthCard did={account.did} /> : null}
      {account.kind === "organization" ? <DataCouncilCard did={account.did} /> : null}

      {/* Recognition rows fetch their own data and render nothing when empty. */}
      <QuietRailBlock>
        <AccountAwards did={account.did} />
      </QuietRailBlock>
      {memberships.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">{organizationsT("memberOf")}</h2>
          <AccountMemberships organizations={memberships} hideLabel />
        </section>
      ) : null}
    </div>
  );
}
