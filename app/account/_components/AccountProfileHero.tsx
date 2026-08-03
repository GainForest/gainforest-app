"use client";

/**
 * The identity header shared by every account tab: photo, name, a single line
 * of plain-language facts (type · place · since), and the two actions a visitor
 * needs — follow and share.
 *
 * The hero carries durable identity: name, facts, outward links, and any
 * endorsement. The Overview carries the account's story, work, and counts.
 * The pieces below are exported so the owner's editable header (see
 * `EditableAccountHeader`) can render the exact same shell with editable fields
 * inside it.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { CheckIcon, GlobeIcon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCountry } from "@/app/_lib/format";
import { FollowButton } from "@/app/_components/FollowButton";
import { SocialGlyph } from "@/app/_components/SocialIcon";
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
  children,
}: {
  avatar: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-account-hero
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 pt-1 sm:flex sm:items-start sm:gap-5"
    >
      <div className="col-start-1 row-start-1 shrink-0 sm:order-1">{avatar}</div>
      <div className="col-span-2 row-start-2 mt-3 min-w-0 sm:order-2 sm:mt-0 sm:flex-1">{children}</div>
      {actions ? (
        <div className="col-start-2 row-start-1 flex justify-self-end gap-2 sm:order-3 sm:ml-auto sm:shrink-0">
          {actions}
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

/** Strip the scheme so a website reads as plain text: "gainforest.net". */
export function formatWebsiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** Best-guess platform for a social URL, for the right glyph. */
export function classifySocialUrl(url: string): string {
  try {
    const host = new URL(externalHref(url)).hostname.replace(/^www\./, "");
    if (host === "x.com" || host.includes("twitter.")) return "x";
    if (host.includes("linkedin.")) return "linkedin";
    if (host.includes("github.")) return "github";
    if (host.includes("instagram.")) return "instagram";
    if (host.includes("facebook.") || host === "fb.com") return "facebook";
    if (host.includes("youtube.") || host === "youtu.be") return "youtube";
    if (host === "t.me" || host.includes("telegram.")) return "telegram";
    if (host.includes("tiktok.")) return "tiktok";
    if (host.includes("bsky.") || host.includes("bluesky.")) return "bluesky";
    return "website";
  } catch {
    return "website";
  }
}

/** Website + social links, as quiet inline links under the facts line. */
export function AccountHeroLinks({
  website,
  socialLinks,
  endorsement,
  className,
}: {
  website: string | null;
  socialLinks: string[];
  /** A small proof mark that belongs alongside the account's outward links. */
  endorsement?: ReactNode;
  className?: string;
}) {
  if (!website && socialLinks.length === 0 && !endorsement) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5",
        (website || socialLinks.length > 0) && "mt-2",
        className,
      )}
    >
      {website ? (
        <Link
          href={externalHref(website)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <GlobeIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{formatWebsiteLabel(website)}</span>
        </Link>
      ) : null}
      {socialLinks.length > 0 ? (
        <span className="flex flex-wrap items-center gap-2">
          {socialLinks.map((url) => {
            const label = formatWebsiteLabel(url);
            return (
              <Link
                key={url}
                href={externalHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <SocialGlyph platform={classifySocialUrl(url)} />
              </Link>
            );
          })}
        </span>
      ) : null}
      {endorsement}
    </div>
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

/** Year-level "Since 2022" / "Joined Jun 2022" date for the facts line. */
export function heroDateLabel(value: string | null | undefined, locale: string, yearOnly: boolean): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale,
    yearOnly ? { year: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Read-only facts line, shared by the public hero and the editable one's
 *  non-editable fields. */
export function AccountHeroFacts({ account }: { account: AccountRouteData }) {
  const t = useTranslations("common.accountOverview");
  const locale = useLocale();
  const isOrganization = account.kind === "organization";
  const orgType = isOrganization ? displayOrgType(account.orgType ?? account.summary.certOrgType) : null;
  const country = account.country ? formatCountry(account.country) : null;
  const since = isOrganization
    ? heroDateLabel(account.foundedDate ?? account.createdAt, locale, true)
    : heroDateLabel(account.createdAt, locale, false);

  const facts = [
    orgType,
    country,
    since ? (isOrganization ? t("sinceDate", { date: since }) : t("joinedDate", { date: since })) : null,
  ].filter((fact): fact is string => Boolean(fact));

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
    >
      <AccountHeroName>{account.displayName}</AccountHeroName>
      <AccountHeroFacts account={account} />
      <AccountHeroLinks
        website={account.website}
        socialLinks={account.socialLinks}
        endorsement={<AccountHeroTrustedBy did={account.did} />}
      />
    </AccountHeroFrame>
  );
}
