"use client";

/**
 * The identity header shared by every account tab: photo, name, a single line
 * of plain-language facts (type · place · since), and the two actions a visitor
 * needs — follow and share.
 *
 * Everything else about the account (bio, links, counts, projects) lives in the
 * Overview column beside the record stream, so this header stays the same
 * height on every tab. The pieces below are exported so the owner's editable
 * header (see `EditableAccountHeader`) can render the exact same shell with
 * editable fields inside it.
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
import type { AccountRouteData } from "../_lib/account-route";

/** Photo frame: a soft-cornered square, like the app's record thumbnails. */
export const HERO_AVATAR_CLASS =
  "relative size-14 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-border/60 sm:size-[68px]";

/** Frame every hero variant shares: photo, identity block, actions. */
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
    <section data-account-hero className="flex items-start gap-4 pt-1 sm:gap-5">
      {avatar}
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
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
  className,
}: {
  website: string | null;
  socialLinks: string[];
  className?: string;
}) {
  if (!website && socialLinks.length === 0) return null;

  return (
    <div className={cn("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
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
      <AccountHeroLinks website={account.website} socialLinks={account.socialLinks} />
    </AccountHeroFrame>
  );
}
