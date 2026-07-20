"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EarthIcon,
  GlobeIcon,
  PencilIcon,
  Share2Icon,
} from "lucide-react";
import type { AccountRouteData } from "../_lib/account-route";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { AccountMemberships } from "./AccountMemberships";
import { AccountWalletSupport } from "./AccountWalletSupport";
import { formatCountry } from "../../_lib/format";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
import { AccountAwards } from "./AccountAwards";
import { FollowButton, FollowProvider, FollowStats } from "@/app/_components/FollowButton";
import { Button } from "@/components/ui/button";

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

function formatSinceDate(value: string | null): { label: string | null; state: "empty" | "valid" | "invalid" } {
  if (!value) return { label: null, state: "empty" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: null, state: "invalid" };
  return {
    label: date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    state: "valid",
  };
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
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedIdentifier, setCopiedIdentifier] = useState<"did" | "wallet" | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const heroT = useTranslations("upload.dashboardClient.hero");
  const actionsT = useTranslations("upload.actions");
  const globeT = useTranslations("marketplace.globe");

  const initial = account.displayName.charAt(0).toUpperCase();
  const sinceDate = formatSinceDate(account.kind === "organization" ? account.foundedDate ?? account.createdAt : account.createdAt);
  const country = account.country ? formatCountry(account.country) : null;
  const orgType = account.kind === "organization" ? account.orgType ?? account.summary.certOrgType : null;
  const hasFacts = Boolean(sinceDate.state === "valid" || country || orgType);

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

  function handleShare() {
    const publicUrl = `${window.location.origin}/account/${encodeURIComponent(account.urlIdentifier)}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyIdentifier(kind: "did" | "wallet", value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedIdentifier(kind);
      setTimeout(() => setCopiedIdentifier((current) => current === kind ? null : current), 2000);
    });
  }

  return (
    <FollowProvider targetDid={account.did}>
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="relative h-32 sm:h-40 md:h-44">
        <motion.div
          initial={{ scale: 1.04, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0"
        >
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-card to-transparent" />
        </motion.div>

        <div className="absolute right-3 top-3 z-20 flex items-start gap-2">
          <div className="relative flex flex-col items-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={handleShare} aria-label={heroT("copyProfileLink")}>
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="copied"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5"
                  >
                    <CheckIcon className="size-3.5 text-primary" />
                    <span className="hidden sm:inline">{heroT("copied")}</span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="share"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1.5"
                  >
                    <Share2Icon className="size-3.5" />
                    <span className="hidden sm:inline">{heroT("share")}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>

            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-label={detailsOpen ? heroT("hideAccountDetails") : heroT("showAccountDetails")}
              className="inline-flex h-6 items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {heroT("accountDetails")}
              <ChevronDownIcon
                aria-hidden
                className={`size-3 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {detailsOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute right-0 top-full mt-1 flex w-[calc(100vw-9.5rem)] max-w-[19rem] flex-col items-end gap-1"
                >
                  <button
                    type="button"
                    onClick={() => copyIdentifier("did", account.did)}
                    aria-label={heroT("copyDid")}
                    title={heroT("copyDid")}
                    className="group flex w-full items-center gap-1.5 text-[11px] text-muted-foreground/75 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">{heroT("did")}</span>
                    <span className="min-w-0 flex-1 truncate text-right font-mono">{account.did}</span>
                    {copiedIdentifier === "did" ? <CheckIcon className="size-3 text-primary" aria-hidden /> : <CopyIcon className="size-3 shrink-0 opacity-30 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" aria-hidden />}
                  </button>
                  {walletAddress ? (
                    <button
                      type="button"
                      onClick={() => copyIdentifier("wallet", walletAddress)}
                      aria-label={heroT("copyWallet")}
                      title={heroT("copyWallet")}
                      className="group flex w-full items-center gap-1.5 text-[11px] text-muted-foreground/75 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">{heroT("wallet")}</span>
                      <span className="min-w-0 flex-1 truncate text-right font-mono">{walletAddress}</span>
                      {copiedIdentifier === "wallet" ? <CheckIcon className="size-3 text-primary" aria-hidden /> : <CopyIcon className="size-3 shrink-0 opacity-30 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" aria-hidden />}
                    </button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          {editHref ? (
            <Button asChild size="sm">
              <Link href={editHref}>
                <PencilIcon />
                {actionsT("edit")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end md:gap-5">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted ring-4 ring-card">
            {account.avatarUrl ? (
              <Image src={account.avatarUrl} alt={account.displayName} fill unoptimized className="object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm font-bold text-muted-foreground">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0 max-w-2xl md:flex-1 md:pb-1">
            <h1 className="font-instrument text-3xl font-light italic leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl">
              {account.displayName}
            </h1>
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {account.description ?? ""}
            </p>
            <FollowStats targetDid={account.did} identifier={account.urlIdentifier} className="mt-2.5" />
            {/* Quiet facts — read-only metadata rendered as text, never as
                fake buttons, so only real actions look pressable. */}
            {hasFacts ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                {orgType ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2Icon className="size-3.5 opacity-70" aria-hidden />
                    {orgType}
                  </span>
                ) : null}
                {country ? <span className="inline-flex items-center gap-1.5">{country}</span> : null}
                {sinceDate.state === "valid" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
                    {heroT("sinceDate", { date: sinceDate.label ?? "" })}
                  </span>
                ) : null}
              </div>
            ) : null}
            {/* Trust + awards read as one quiet metadata row under the title;
                each half renders nothing when the account has none. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 empty:mt-0">
              <TrustedByBadges did={account.did} variant="plain" className="w-fit" />
              <AccountAwards did={account.did} className="w-fit" />
            </div>
            <AccountMemberships organizations={memberships} className="mt-3" />
          </div>
        </div>

        {/* Actions — one row of same-height pills: follow, direct support,
            then the outbound links (globe view, website, socials). */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <FollowButton targetDid={account.did} name={account.displayName} size="default" />
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
          {(account.website || account.socialLinks.length > 0) ? (
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          ) : null}
          {account.website ? (
            <Button asChild variant="outline" size="icon" className="text-muted-foreground hover:text-foreground" title={formatWebsite(account.website)} aria-label={heroT("openSocialLink", { link: formatWebsite(account.website) })}>
              <Link href={externalHref(account.website)} target="_blank" rel="noopener noreferrer">
                <GlobeIcon />
              </Link>
            </Button>
          ) : null}
          {account.socialLinks.map((url) => {
            const label = formatWebsite(url);
            return (
              <Button key={url} asChild variant="outline" size="icon" className="text-muted-foreground hover:text-foreground" title={label} aria-label={heroT("openSocialLink", { link: label })}>
                <Link href={externalHref(url)} target="_blank" rel="noopener noreferrer">
                  <SocialGlyph platform={classifySocial(url)} />
                </Link>
              </Button>
            );
          })}
        </div>
      </div>
    </section>
    </FollowProvider>
  );
}
