"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2Icon, CalendarIcon, CheckIcon, EarthIcon, GlobeIcon, Share2Icon } from "lucide-react";
import type { AccountRouteData } from "../_lib/account-route";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { AccountMemberships } from "./AccountMemberships";
import { AccountWalletSupport } from "./AccountWalletSupport";
import { AccountAwards } from "./AccountAwards";
import { FollowButton, FollowProvider, FollowStats } from "@/app/_components/FollowButton";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
import { formatCountry } from "@/app/_lib/format";
import { Button } from "@/components/ui/button";

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
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

function formatSinceDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Profile metadata and actions shown only inside the Overview tab. */
export function AccountOverviewDetails({
  account,
  memberships = [],
}: {
  account: AccountRouteData;
  memberships?: AccountOrganization[];
}) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const heroT = useTranslations("upload.dashboardClient.hero");
  const globeT = useTranslations("marketplace.globe");
  const sinceDate = formatSinceDate(
    account.kind === "organization" ? account.foundedDate ?? account.createdAt : account.createdAt,
  );
  const country = account.country ? formatCountry(account.country) : null;
  const orgType = account.kind === "organization" ? account.orgType ?? account.summary.certOrgType : null;
  const hasFacts = Boolean(sinceDate || country || orgType);

  useEffect(() => {
    let cancelled = false;
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
      window.removeEventListener("gainforest:wallet-changed", loadWallet);
    };
  }, [account.did]);

  const handleShare = () => {
    const publicUrl = `${window.location.origin}/account/${encodeURIComponent(account.urlIdentifier)}`;
    void navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <FollowProvider targetDid={account.did}>
      <section
        data-account-overview-details
        className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5"
      >
        <h2 className="font-instrument text-2xl font-light italic text-foreground">
          {heroT("accountDetails")}
        </h2>

        <FollowStats
          targetDid={account.did}
          identifier={account.urlIdentifier}
          className="mt-3"
        />

        {hasFacts ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
            {orgType ? (
              <span className="inline-flex items-center gap-1.5">
                <Building2Icon className="size-3.5 opacity-70" aria-hidden />
                {orgType}
              </span>
            ) : null}
            {country ? <span className="inline-flex items-center gap-1.5">{country}</span> : null}
            {sinceDate ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
                {heroT("sinceDate", { date: sinceDate })}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 empty:mt-0">
          <TrustedByBadges did={account.did} variant="plain" className="w-fit" />
          <AccountAwards did={account.did} className="w-fit" />
        </div>
        <AccountMemberships organizations={memberships} className="mt-3" />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <FollowButton targetDid={account.did} name={account.displayName} size="default" />
          {account.kind === "organization" ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleShare}
              aria-label={heroT("copyProfileLink")}
            >
              {copied ? <CheckIcon /> : <Share2Icon />}
              {copied ? heroT("copied") : heroT("share")}
            </Button>
          ) : null}
          <AccountWalletSupport
            did={account.did}
            name={account.displayName}
            image={account.avatarUrl}
            walletAddress={walletAddress}
          />
          {account.kind === "organization" ? (
            <Button asChild variant="outline">
              <Link href={`/globe/${encodeURIComponent(account.urlIdentifier)}`}>
                <EarthIcon />
                {globeT("viewOnGlobe")}
              </Link>
            </Button>
          ) : null}
          {account.website ? (
            <Button asChild variant="outline" className="max-w-full">
              <Link href={externalHref(account.website)} target="_blank" rel="noopener noreferrer">
                <GlobeIcon />
                <span className="max-w-64 truncate">{formatWebsite(account.website)}</span>
              </Link>
            </Button>
          ) : null}
          {account.socialLinks.map((url) => {
            const label = formatWebsite(url);
            return (
              <Button key={url} asChild variant="outline" className="max-w-full">
                <Link href={externalHref(url)} target="_blank" rel="noopener noreferrer">
                  <SocialGlyph platform={classifySocial(url)} />
                  <span className="max-w-52 truncate">{label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </section>
    </FollowProvider>
  );
}
