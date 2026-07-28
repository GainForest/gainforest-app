"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, EarthIcon, GlobeIcon, Share2Icon } from "lucide-react";
import { accountFollowersPath, accountFollowingPath, type AccountRouteData } from "../_lib/account-route";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { AccountMemberships } from "./AccountMemberships";
import { AccountWalletSupport } from "./AccountWalletSupport";
import { AccountAwards } from "./AccountAwards";
import { FollowButton, FollowProvider, useFollowState } from "@/app/_components/FollowButton";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
import { formatCompact, formatCountry } from "@/app/_lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const TILE = "min-w-[9rem] flex-1 rounded-2xl bg-muted p-3";

/**
 * A muted grid tile: label pinned top-left, content below. Hides itself when
 * its body renders nothing, so async tiles (awards / trusted-by / memberships)
 * never leave a lonely label behind.
 */
function LabeledTile({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn(TILE, "flex flex-col [&:has([data-tile-body]:empty)]:hidden")}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div data-tile-body className="mt-1 text-sm font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

/** Followers + following counts and the Follow button, in one muted tile. */
function FollowStatTile({
  account,
}: {
  account: AccountRouteData;
}) {
  const t = useTranslations("common.follow");
  const follow = useFollowState(account.did);
  return (
    <div className="flex min-w-[16rem] flex-[2] items-center justify-between gap-3 rounded-2xl bg-muted p-3">
      <div className="flex gap-6">
        <Link href={accountFollowersPath(account.urlIdentifier)} className="transition-colors hover:text-foreground">
          <div className="text-lg font-semibold tabular-nums text-foreground">{formatCompact(follow.followers)}</div>
          <div className="text-xs text-muted-foreground">{t("followersLabel")}</div>
        </Link>
        <Link href={accountFollowingPath(account.urlIdentifier)} className="transition-colors hover:text-foreground">
          <div className="text-lg font-semibold tabular-nums text-foreground">{formatCompact(follow.following)}</div>
          <div className="text-xs text-muted-foreground">{t("followingLabel")}</div>
        </Link>
      </div>
      <FollowButton targetDid={account.did} name={account.displayName} size="sm" />
    </div>
  );
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
  const orgsT = useTranslations("common.accountOrganizations");
  const recognitionT = useTranslations("common.recognition");
  const trustT = useTranslations("common.trust");
  const sinceDate = formatSinceDate(
    account.kind === "organization" ? account.foundedDate ?? account.createdAt : account.createdAt,
  );
  const country = account.country ? formatCountry(account.country) : null;
  const orgType = account.kind === "organization" ? account.orgType ?? account.summary.certOrgType : null;

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
      <section data-account-overview-details className="mt-6 space-y-4">
        <h2 className="font-instrument text-2xl font-light italic text-foreground">
          {heroT("aboutName", { name: account.displayName })}
        </h2>

        <div className="flex flex-wrap gap-2">
          <FollowStatTile account={account} />
          {orgType ? <LabeledTile label={heroT("typeLabel")}>{orgType}</LabeledTile> : null}
          {country ? <LabeledTile label={heroT("countryLabel")}>{country}</LabeledTile> : null}
          {sinceDate ? <LabeledTile label={heroT("joinedLabel")}>{sinceDate}</LabeledTile> : null}
          <LabeledTile label={orgsT("memberOf")}>
            <AccountMemberships organizations={memberships} hideLabel />
          </LabeledTile>
          <LabeledTile label={recognitionT("awardsLabel")}>
            <AccountAwards did={account.did} hideLabel />
          </LabeledTile>
          <LabeledTile label={trustT("trustedBy")}>
            <TrustedByBadges did={account.did} variant="plain" hideLabel />
          </LabeledTile>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleShare}
            aria-label={heroT("copyProfileLink")}
          >
            {copied ? <CheckIcon /> : <Share2Icon />}
            {copied ? heroT("copied") : heroT("share")}
          </Button>
          <AccountWalletSupport
            did={account.did}
            name={account.displayName}
            image={account.avatarUrl}
            walletAddress={walletAddress}
          />
          {account.kind === "organization" ? (
            <Button asChild variant="secondary">
              <Link href={`/globe/${encodeURIComponent(account.urlIdentifier)}`}>
                <EarthIcon />
                {globeT("viewOnGlobe")}
              </Link>
            </Button>
          ) : null}
          {account.website ? (
            <Button asChild variant="secondary" className="max-w-full">
              <Link href={externalHref(account.website)} target="_blank" rel="noopener noreferrer">
                <GlobeIcon />
                <span className="max-w-64 truncate">{formatWebsite(account.website)}</span>
              </Link>
            </Button>
          ) : null}
          {account.socialLinks.map((url) => {
            const label = formatWebsite(url);
            return (
              <Button key={url} asChild variant="secondary" size="icon">
                <Link href={externalHref(url)} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                  <SocialGlyph platform={classifySocial(url)} />
                </Link>
              </Button>
            );
          })}
        </div>
      </section>
    </FollowProvider>
  );
}
