"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  GlobeIcon,
  MapPinIcon,
  PencilIcon,
  Share2Icon,
} from "lucide-react";
import type { AccountRouteData } from "../_lib/account-route";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { AccountMemberships } from "./AccountMemberships";
import { formatCountry } from "../../_lib/format";
import { SocialGlyph } from "@/app/_components/SocialIcon";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";
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
  const heroT = useTranslations("upload.dashboardClient.hero");
  const actionsT = useTranslations("upload.actions");

  const initial = account.displayName.charAt(0).toUpperCase();
  const sinceDate = formatSinceDate(account.kind === "organization" ? account.foundedDate ?? account.createdAt : account.createdAt);
  const country = account.country ? formatCountry(account.country) : null;
  const orgType = account.kind === "organization" ? account.orgType ?? account.summary.certOrgType : null;
  const hasDetails = sinceDate.state === "valid" || country || orgType || account.website || account.socialLinks.length > 0;

  function handleShare() {
    const publicUrl = `${window.location.origin}/account/${encodeURIComponent(account.urlIdentifier)}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
              alt={`Cover image for ${account.displayName}`}
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

        <TrustedByBadges did={account.did} className="absolute left-3 top-3 z-10 w-fit" />

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleShare} aria-label="Copy link">
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
                  <span className="hidden sm:inline">Copied</span>
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
                  <span className="hidden sm:inline">Share</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
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
            <AccountMemberships organizations={memberships} className="mt-3" />
          </div>
        </div>

        {hasDetails ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {orgType ? (
              <Button asChild variant="outline">
                <span>
                  <Building2Icon />
                  {orgType}
                </span>
              </Button>
            ) : null}
            {country ? (
              <Button asChild variant="outline">
                <span>
                  <MapPinIcon />
                  {country}
                </span>
              </Button>
            ) : null}
            {sinceDate.state === "valid" ? (
              <Button asChild variant="outline">
                <span>
                  <CalendarIcon />
                  {heroT("sinceDate", { date: sinceDate.label ?? "" })}
                </span>
              </Button>
            ) : null}
            <FollowButton targetDid={account.did} name={account.displayName} />
            {account.website ? (
              <Button asChild variant="outline" size="icon" title={formatWebsite(account.website)} aria-label={heroT("openSocialLink", { link: formatWebsite(account.website) })}>
                <Link href={externalHref(account.website)} target="_blank" rel="noopener noreferrer">
                  <GlobeIcon />
                </Link>
              </Button>
            ) : null}
            {account.socialLinks.map((url) => {
              const label = formatWebsite(url);
              return (
                <Button key={url} asChild variant="outline" size="icon" title={label} aria-label={heroT("openSocialLink", { link: label })}>
                  <Link href={externalHref(url)} target="_blank" rel="noopener noreferrer">
                    <SocialGlyph platform={classifySocial(url)} />
                  </Link>
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5">
            <FollowButton targetDid={account.did} name={account.displayName} />
          </div>
        )}
      </div>
    </section>
    </FollowProvider>
  );
}
