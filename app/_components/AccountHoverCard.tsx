"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheckIcon,
  BinocularsIcon,
  Building2Icon,
  GlobeIcon,
  Loader2Icon,
  StampIcon,
  UserRoundIcon,
} from "lucide-react";
import type { AccountSummary } from "../_lib/indexer";
import { resolveAccountSummary, getCachedAccountSummary } from "../_lib/account-summary-client";
import { accountHref } from "../_lib/urls";
import { formatCompact } from "../_lib/format";
import { ResolvedAvatar } from "../feed/ResolvedAvatar";
import { FollowButton, FollowProvider, FollowStats } from "./FollowButton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "loaded" | "error";

/**
 * Wraps an avatar or author name in the feed with a rich hover card that
 * surfaces a comprehensive snapshot of the account — identity, bio, location,
 * join date, and lifetime sighting + Cert counts — fetched lazily the first
 * time the card opens. When there's no resolvable account (anonymous rows),
 * the children render untouched.
 */
export function AccountHoverCard({
  did,
  name,
  avatarRef,
  children,
  triggerClassName,
}: {
  did: string | null | undefined;
  name?: string | null;
  avatarRef?: string | null;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [summary, setSummary] = useState<AccountSummary | null>(() =>
    did ? getCachedAccountSummary(did) ?? null : null,
  );
  const [status, setStatus] = useState<Status>(() =>
    did && getCachedAccountSummary(did) ? "loaded" : "idle",
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!did) return <>{children}</>;

  function handleOpenChange(open: boolean) {
    if (!open || !did) return;
    if (status === "loaded" || status === "loading") return;
    setStatus("loading");
    const controller = new AbortController();
    abortRef.current = controller;
    resolveAccountSummary(did, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data) {
          setSummary(data);
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
  }

  return (
    <HoverCard openDelay={250} closeDelay={120} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        <span className={cn("cursor-pointer", triggerClassName)}>{children}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <AccountCardBody
          did={did}
          summary={summary}
          status={status}
          fallbackName={name}
          fallbackAvatarRef={avatarRef}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function AccountCardBody({
  did,
  summary,
  status,
  fallbackName,
  fallbackAvatarRef,
}: {
  did: string;
  summary: AccountSummary | null;
  status: Status;
  fallbackName?: string | null;
  fallbackAvatarRef?: string | null;
}) {
  const t = useTranslations("common.feed.profileCard");

  const displayName = summary?.displayName?.trim() || fallbackName?.trim() || t("unnamed");
  const isOrg = Boolean(summary?.hasCertifiedOrg);
  const handle = summary?.handle?.trim() || null;
  const bio = summary?.bio?.trim() || null;
  const website = summary?.website?.trim() || null;
  const verified = Boolean(summary?.hasCertifiedProfile) || isOrg;
  const kindLabel = isOrg ? summary?.certOrgType?.trim() || t("organization") : t("member");

  return (
    <FollowProvider targetDid={did}>
      <div className="flex flex-col gap-3">
        {/* Avatar + Follow */}
        <div className="flex items-start justify-between gap-3">
          <Link
            href={accountHref(did)}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ResolvedAvatar
              did={did}
              imageUrl={summary?.avatarUrl ?? null}
              avatarRef={summary?.avatarUrl ? null : fallbackAvatarRef}
              name={displayName}
              fallbackIcon={isOrg ? <Building2Icon className="size-6" /> : <UserRoundIcon className="size-6" />}
              className="size-14"
              sizes="56px"
            />
          </Link>
          <FollowButton targetDid={did} name={displayName} />
        </div>

        {/* Name + handle */}
        <div className="min-w-0">
          <Link href={accountHref(did)} className="group/name inline-flex max-w-full items-center gap-1">
            <span className="truncate text-[15px] font-semibold leading-tight text-foreground group-hover/name:underline">
              {displayName}
            </span>
            {verified ? (
              <BadgeCheckIcon className="size-3.5 shrink-0 text-primary" aria-label={t("verified")} />
            ) : null}
          </Link>
          <p className="truncate text-sm text-muted-foreground">{handle ? `@${handle}` : kindLabel}</p>
        </div>

        {/* Followers / following */}
        <FollowStats targetDid={did} />

        {/* Bio */}
        {bio ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">{bio}</p>
        ) : status === "loading" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            {t("loading")}
          </p>
        ) : status === "error" ? (
          <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
        ) : null}

        {/* Website */}
        {website ? (
          <a
            href={externalHref(website)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 truncate text-sm text-primary hover:underline"
          >
            <GlobeIcon className="size-3.5 shrink-0" />
            <span className="truncate">{formatWebsite(website)}</span>
          </a>
        ) : null}

        {/* GainForest contribution stats */}
        {summary && (summary.observationCount > 0 || summary.bumicertCount > 0) ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
            <Stat
              icon={<BinocularsIcon className="size-3.5" />}
              value={formatCompact(summary.observationCount)}
              label={t("sightings", { count: summary.observationCount })}
            />
            <Stat
              icon={<StampIcon className="size-3.5" />}
              value={formatCompact(summary.bumicertCount)}
              label={t("certs", { count: summary.bumicertCount })}
            />
          </div>
        ) : null}
      </div>
    </FollowProvider>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-2.5 py-1.5">
      <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
        <span className="text-primary/70">{icon}</span>
        {value}
      </span>
      <span className="truncate text-[11px] leading-none text-muted-foreground">{label}</span>
    </div>
  );
}

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function externalHref(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}
