"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlobeIcon,
  CalendarIcon,
  Share2Icon,
  CheckIcon,
  PencilIcon,
} from "lucide-react";
import type { AccountRouteData } from "../_lib/account-route";
import { accountSettingsPath } from "../_lib/account-route";
import { countryFlag } from "../../_lib/format";

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
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

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function AccountHero({
  account,
  isOwner,
}: {
  account: AccountRouteData;
  isOwner: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const initial = account.displayName.charAt(0).toUpperCase();
  const sinceDate = formatSinceDate(account.createdAt);
  const sinceLabel = sinceDate.label;
  const countryCode = account.country;
  const country = countryCode ? { emoji: countryFlag(countryCode), name: countryName(countryCode) } : null;
  const objectives = account.kind === "organization" ? [account.summary.certOrgType].filter((v): v is string => Boolean(v)) : [];
  const hasPillRow =
    sinceDate.state === "valid" ||
    country ||
    objectives.length > 0 ||
    account.website;

  function handleShare() {
    const publicUrl = `${window.location.origin}/account/${encodeURIComponent(account.urlIdentifier)}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="relative min-h-[260px] md:min-h-[320px] flex flex-col overflow-hidden rounded-t-4xl border-t border-border">
      <div className="absolute inset-0">
        <motion.div
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: [0.25, 0.1, 0.25, 1] }}
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
                  "radial-gradient(circle at 30% 50%, oklch(0.5 0.07 157 / 0.08) 0%, transparent 60%), radial-gradient(circle at 75% 25%, oklch(0.5 0.07 157 / 0.05) 0%, transparent 50%)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-background/0 via-background/75 to-background" />
        </motion.div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <motion.button
          onClick={handleShare}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/55 backdrop-blur-xl border border-white/20 shadow-lg cursor-pointer hover:bg-background/70 transition-colors"
          aria-label="Copy link"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5"
              >
                <CheckIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs font-medium text-primary">Copied</span>
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
                <Share2Icon className="h-3.5 w-3.5 text-foreground/80 shrink-0" />
                <span className="text-xs font-medium text-foreground/80">Share</span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {isOwner && (
          <Link
            href={accountSettingsPath(account.urlIdentifier)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground border border-primary/20 shadow-lg transition-colors"
            aria-label="Edit profile"
          >
            <PencilIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">Edit</span>
          </Link>
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-end px-5 pb-6 pt-24">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-3 org-animate org-fade-in-up org-delay-1">
          <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted border border-white/15 shadow-sm shrink-0">
            {account.avatarUrl ? (
              <Image src={account.avatarUrl} alt={account.displayName} fill unoptimized className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                {initial}
              </div>
            )}
          </div>
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-[-0.02em] leading-none text-foreground font-instrument italic">
              {account.displayName}
            </h1>
            <p className="text-muted-foreground line-clamp-4 md:line-clamp-2 mt-1">
              {account.description ?? ""}
            </p>
          </div>
        </div>
        {hasPillRow && (
          <div className="mt-4 flex flex-wrap items-center gap-2 org-animate org-fade-in-up org-delay-3">
            {sinceLabel && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-foreground/60 bg-background/40 backdrop-blur-md border border-border/50 rounded-full px-2.5 py-1 font-medium">
                <CalendarIcon className="h-3 w-3 shrink-0" />
                Since {sinceLabel}
              </span>
            )}

            {country && (
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-foreground/60 bg-background/40 backdrop-blur-md border border-border/50 rounded-full px-2.5 py-1 font-medium">
                <span className="text-sm leading-none" aria-hidden="true">
                  {country.emoji}
                </span>
                {country.name}
              </span>
            )}

            {objectives.map((obj) => (
              <span
                key={obj}
                className="text-[10px] uppercase tracking-[0.08em] text-foreground/60 bg-background/40 backdrop-blur-md border border-border/50 rounded-full px-2.5 py-1 font-medium"
              >
                {obj}
              </span>
            ))}

            {account.website && (
              <Link
                href={account.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-primary/80 hover:text-primary bg-background/40 backdrop-blur-md border border-primary/20 rounded-full px-2.5 py-1 font-medium transition-colors"
              >
                <GlobeIcon className="h-3 w-3 shrink-0" />
                {formatWebsite(account.website)}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
