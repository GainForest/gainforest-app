"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  EarthIcon,
  GlobeIcon,
  PencilIcon,
  Share2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { AccountRouteData } from "../_lib/account-route";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { AccountMemberships } from "./AccountMemberships";
import { AccountWalletSupport } from "./AccountWalletSupport";
import { countryFlag, formatCountry } from "../../_lib/format";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
import { AccountAwards } from "./AccountAwards";
import { FollowButton, FollowProvider, FollowStats } from "@/app/_components/FollowButton";
import { Button } from "@/components/ui/button";
import { DisplayHeading } from "@/components/ui/typography";

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

function localizedCountry(code: string, locale: string): string {
  const normalized = code.trim().toUpperCase();
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(normalized);
    if (name && name !== normalized) return [countryFlag(normalized), name].filter(Boolean).join(" ");
  } catch {
    // Fall through to the shared English-safe formatter for unusual codes.
  }
  return formatCountry(normalized);
}

function validDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function classifySocial(url: string): string {
  try {
    const host = new URL(externalHref(url)).hostname.replace(/^www\./, "");
    if (host.includes("x.com") || host.includes("twitter.com")) return "x";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("github.com")) return "github";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("facebook.com")) return "facebook";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    return "website";
  } catch {
    return "website";
  }
}

export function AccountHero({
  account,
  editHref = null,
  memberships = [],
}: {
  account: AccountRouteData;
  editHref?: string | null;
  memberships?: AccountOrganization[];
}) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const shareTimerRef = useRef<number | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const heroT = useTranslations("upload.dashboardClient.hero");
  const actionsT = useTranslations("upload.actions");
  const globeT = useTranslations("marketplace.globe");
  const formatter = useFormatter();
  const locale = useLocale();

  const initial = account.displayName.charAt(0).toUpperCase();
  const sinceDate = validDate(account.kind === "organization" ? account.foundedDate ?? account.createdAt : account.createdAt);
  const sinceLabel = sinceDate
    ? formatter.dateTime(sinceDate, { month: "short", year: "numeric", timeZone: "UTC" })
    : null;
  const country = account.country ? localizedCountry(account.country, locale) : null;
  const orgType = account.kind === "organization" ? account.orgType ?? account.summary.certOrgType : null;
  const hasFacts = Boolean(sinceLabel || country || orgType);

  useEffect(() => {
    let cancelled = false;
    setWalletAddress(null);
    setShareState("idle");
    if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    const loadWallet = () => {
      fetch(`/api/verify-recipient?did=${encodeURIComponent(account.did)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((result: { hasAttestation?: boolean; address?: string } | null) => {
          if (!cancelled) setWalletAddress(result?.hasAttestation && result.address ? result.address : null);
        })
        .catch(() => {
          if (!cancelled) setWalletAddress(null);
        });
    };

    loadWallet();
    window.addEventListener("gainforest:wallet-changed", loadWallet);
    return () => {
      cancelled = true;
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
      window.removeEventListener("gainforest:wallet-changed", loadWallet);
    };
  }, [account.did]);

  async function handleShare() {
    const publicUrl = `${window.location.origin}/account/${encodeURIComponent(account.urlIdentifier)}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setShareState("copied");
    } catch {
      setShareState("error");
    }
    if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    shareTimerRef.current = window.setTimeout(() => {
      setShareState("idle");
      shareTimerRef.current = null;
    }, 2000);
  }

  return (
    <FollowProvider key={account.did} targetDid={account.did}>
      <section className="overflow-hidden rounded-3xl bg-background">
        <div className="relative h-32 sm:h-40 md:h-44">
          {account.coverUrl ? (
            <Image
              src={account.coverUrl}
              alt={heroT("coverImageAlt", { name: account.displayName })}
              fill
              priority
              unoptimized
              className="object-cover object-center"
              sizes="(max-width: 1152px) 100vw, 1152px"
            />
          ) : (
            <div
              className="absolute inset-0 bg-muted"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 22% 40%, oklch(0.5 0.07 157 / 0.14) 0%, transparent 55%), radial-gradient(circle at 82% 18%, oklch(0.5 0.07 157 / 0.08) 0%, transparent 50%)",
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-background via-background/60 to-transparent" />

          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" className="h-10" onClick={() => void handleShare()} aria-label={heroT("copyProfileLink")} aria-live="polite">
              {shareState === "copied" ? <CheckIcon aria-hidden /> : shareState === "error" ? <TriangleAlertIcon aria-hidden /> : <Share2Icon aria-hidden />}
              <span className="hidden sm:inline">
                {shareState === "copied" ? heroT("copied") : shareState === "error" ? heroT("copyFailed") : heroT("share")}
              </span>
            </Button>
            {editHref ? (
              <Button asChild size="sm" className="h-10">
                <Link href={editHref}><PencilIcon aria-hidden />{actionsT("edit")}</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative z-10 px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end md:gap-5">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-background">
              {account.avatarUrl ? (
                <Image src={account.avatarUrl} alt={account.displayName} fill unoptimized className="object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-bold text-muted-foreground">{initial}</div>
              )}
            </div>
            <div className="min-w-0 max-w-2xl md:flex-1 md:pb-1">
              <DisplayHeading as="h1" className="text-3xl font-light leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl">
                {account.displayName}
              </DisplayHeading>
              {account.description ? <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{account.description}</p> : null}
              <FollowStats targetDid={account.did} identifier={account.urlIdentifier} className="mt-2.5" />
              {hasFacts ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                  {orgType ? <span className="inline-flex items-center gap-1.5"><Building2Icon className="size-3.5 opacity-70" aria-hidden />{orgType}</span> : null}
                  {country ? <span>{country}</span> : null}
                  {sinceLabel ? <span className="inline-flex items-center gap-1.5"><CalendarIcon className="size-3.5 opacity-70" aria-hidden />{heroT("sinceDate", { date: sinceLabel })}</span> : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 empty:mt-0">
                <TrustedByBadges did={account.did} variant="plain" className="w-fit" />
                <AccountAwards did={account.did} className="w-fit" />
              </div>
              <AccountMemberships organizations={memberships} className="mt-3" />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <FollowButton targetDid={account.did} name={account.displayName} size="default" />
            <AccountWalletSupport did={account.did} name={account.displayName} image={account.avatarUrl} walletAddress={walletAddress} />
            {account.kind === "organization" ? (
              <Button asChild variant="outline"><Link href={`/globe/${encodeURIComponent(account.urlIdentifier)}`}><EarthIcon aria-hidden />{globeT("viewOnGlobe")}</Link></Button>
            ) : null}
            {account.website ? (
              <Button asChild variant="outline" size="icon" className="text-muted-foreground hover:text-foreground" title={formatWebsite(account.website)} aria-label={heroT("openSocialLink", { link: formatWebsite(account.website) })}>
                <Link href={externalHref(account.website)} target="_blank" rel="noopener noreferrer"><GlobeIcon aria-hidden /></Link>
              </Button>
            ) : null}
            {account.socialLinks.map((url) => {
              const label = formatWebsite(url);
              return (
                <Button key={url} asChild variant="outline" size="icon" className="text-muted-foreground hover:text-foreground" title={label} aria-label={heroT("openSocialLink", { link: label })}>
                  <Link href={externalHref(url)} target="_blank" rel="noopener noreferrer"><SocialGlyph platform={classifySocial(url)} /></Link>
                </Button>
              );
            })}
          </div>
        </div>
      </section>
    </FollowProvider>
  );
}
