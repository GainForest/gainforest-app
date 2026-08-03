"use client";

/**
 * The identity header shared by every account tab: photo, name, a single line
 * of plain-language facts (type · place), and the two actions a visitor
 * needs — follow and share.
 *
 * The hero carries durable identity: name, facts, who follows the account,
 * and any endorsement. The Overview carries the short description, outward
 * links, work, and supporting profile details.
 * The pieces below are exported so the owner's editable header (see
 * `EditableAccountHeader`) can render the exact same shell with editable fields
 * inside it.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, GlobeIcon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCountry } from "@/app/_lib/format";
import { FollowButton, FollowStats } from "@/app/_components/FollowButton";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
import type { AccountRouteData } from "../_lib/account-route";

/** Photo frame: a soft-cornered square, like the app's record thumbnails. */
export const HERO_AVATAR_CLASS =
  "relative size-14 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-border/60 sm:size-[68px]";

/**
 * Frame every hero variant shares: photo, identity block, actions.
 *
 * On a phone, the identity has its own full-width row beneath the photo and
 * actions. Keeping the name in the same row as a Follow pill and share button
 * left long account names with a needlessly thin text column. From `sm` up,
 * the familiar horizontal hero returns.
 */
export function AccountHeroFrame({
  avatar,
  actions,
  actionFooter,
  children,
}: {
  avatar: ReactNode;
  actions?: ReactNode;
  /** Context for the actions, such as the account's audience counts. */
  actionFooter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-account-hero
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 pt-1 sm:flex sm:items-start sm:gap-5"
    >
      <div className="col-start-1 row-start-1 shrink-0 sm:order-1">{avatar}</div>
      <div className="col-span-2 row-start-2 mt-3 min-w-0 sm:order-2 sm:mt-0 sm:flex-1">{children}</div>
      {actions || actionFooter ? (
        <div className="col-start-2 row-start-1 justify-self-end sm:order-3 sm:ml-auto sm:shrink-0">
          {actions ? <div className="flex justify-end gap-2">{actions}</div> : null}
          {actionFooter ? <div className="mt-2 flex justify-end">{actionFooter}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export function AccountHeroName({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "font-instrument text-[1.75rem] font-light italic leading-[1.15] tracking-[-0.01em] text-foreground sm:text-4xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** The dot-separated facts line under the name. */
export function AccountHeroMeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}>
      {children}
    </div>
  );
}

/** Trailing dot between facts. It follows its fact so a wrapped line never
 *  starts with a stray separator. */
export function AccountHeroMetaDot() {
  return (
    <span aria-hidden className="pl-2 text-muted-foreground/50">
      ·
    </span>
  );
}

function websiteHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The account website is a durable identity link, so it remains in the hero. */
export function AccountHeroWebsite({ website, className }: { website: string | null | undefined; className?: string }) {
  const value = website?.trim();
  if (!value) return null;

  const label = websiteLabel(value);
  return (
    <Link
      href={websiteHref(value)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-2 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <GlobeIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Turn stored organization types into readable words: "indigenous-territory,
 * nonprofit" reads as "Indigenous territory, Nonprofit".
 */
export function displayOrgType(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .split(",")
    .map((part) => part.trim().replace(/[-_]+/g, " "))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(", ");
}

/** Compact account date for the Overview detail tile. */
export function heroDateLabel(value: string | null | undefined, locale: string, yearOnly: boolean): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale,
    yearOnly ? { year: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Read-only identity facts: organization type and country. */
export function AccountHeroFacts({ account }: { account: AccountRouteData }) {
  const isOrganization = account.kind === "organization";
  const orgType = isOrganization ? displayOrgType(account.orgType ?? account.summary.certOrgType) : null;
  const country = account.country ? formatCountry(account.country) : null;

  const facts = [orgType, country].filter((fact): fact is string => Boolean(fact));

  if (facts.length === 0) return null;

  return (
    <AccountHeroMeta>
      {facts.map((fact, index) => (
        <span key={fact}>
          {fact}
          {index < facts.length - 1 ? <AccountHeroMetaDot /> : null}
        </span>
      ))}
    </AccountHeroMeta>
  );
}

/** Copy-the-link action, sized to sit beside the Follow pill. */
export function AccountShareButton({ identifier }: { identifier: string }) {
  const t = useTranslations("common.accountOverview");
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="rounded-full"
      aria-label={copied ? t("shareCopied") : t("share")}
      title={copied ? t("shareCopied") : t("share")}
      onClick={() => {
        const url = `${window.location.origin}/account/${encodeURIComponent(identifier)}`;
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <CheckIcon /> : <Share2Icon />}
    </Button>
  );
}

/** Follow + share, the visitor-facing actions in every hero variant. */
export function AccountHeroActions({ account }: { account: AccountRouteData }) {
  return (
    <>
      <FollowButton targetDid={account.did} name={account.displayName} size="default" className="rounded-full" />
      <AccountShareButton identifier={account.urlIdentifier} />
    </>
  );
}

/** A quiet proof mark belongs with identity, not below the Overview fold. */
export function AccountHeroTrustedBy({ did, className }: { did: string; className?: string }) {
  return <TrustedByBadges did={did} variant="plain" size="xs" className={cn("shrink-0", className)} />;
}

/** The public (read-only) account header. */
export function AccountProfileHero({ account }: { account: AccountRouteData }) {
  const initial = account.displayName.charAt(0).toUpperCase();

  return (
    <AccountHeroFrame
      avatar={
        <div className={HERO_AVATAR_CLASS}>
          {account.avatarUrl ? (
            <Image src={account.avatarUrl} alt="" fill unoptimized sizes="68px" className="object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-lg font-semibold text-muted-foreground">
              {initial}
            </span>
          )}
        </div>
      }
      actions={<AccountHeroActions account={account} />}
      actionFooter={
        <FollowStats
          targetDid={account.did}
          identifier={account.urlIdentifier}
          className="max-w-full justify-end text-right"
        />
      }
    >
      <AccountHeroName>{account.displayName}</AccountHeroName>
      <AccountHeroFacts account={account} />
      <AccountHeroWebsite website={account.website} />
      <AccountHeroTrustedBy did={account.did} className="mt-2" />
    </AccountHeroFrame>
  );
}
