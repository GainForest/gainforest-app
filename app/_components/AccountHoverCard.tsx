"use client";

/**
 * Bluesky-style account hover card: hovering any identity chip lazily surfaces a
 * small card with the account's avatar, name, handle, follower / following
 * counts, bio and a Follow button — without leaving the page. Clicking the chip
 * still opens the full account drawer (the trigger keeps its own onClick).
 *
 * Content loads only once the card opens, and the FollowProvider shares one
 * follow state between the button and the counts so a click updates both.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { fetchAccountSummary, type AccountSummary } from "../_lib/indexer";
import {
  getCachedProfile,
  monogram,
  resolveDidProfile,
  type DidProfile,
} from "../_lib/did-profile";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { FollowButton, FollowProvider, FollowStats } from "./FollowButton";

export function AccountHoverCard({ did, children }: { did: string; children: ReactNode }) {
  const t = useTranslations("common.follow");
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [profile, setProfile] = useState<DidProfile | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!open || !did.startsWith("did:")) return;
    setProfile(getCachedProfile(did) ?? null);
    const controller = new AbortController();
    fetchAccountSummary(did, controller.signal).then(setSummary).catch(() => {});
    resolveDidProfile(did).then(setProfile).catch(() => {});
    return () => controller.abort();
  }, [open, did]);

  // Non-DID subjects (or SSR) get the trigger with no hover behaviour.
  if (!did.startsWith("did:")) return <>{children}</>;

  const handle = summary?.handle ?? profile?.handle ?? null;
  const name = summary?.displayName?.trim() || profile?.displayName?.trim() || handle || t("genericName");
  const avatar = (!avatarFailed && (summary?.avatarUrl ?? profile?.avatar)) || null;
  const bio = summary?.bio?.trim() || null;
  const m = monogram(handle, did);
  const profileHref = `/account/${encodeURIComponent(handle ?? did)}`;

  return (
    <HoverCard openDelay={350} closeDelay={120} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80">
        <FollowProvider targetDid={did}>
          <div className="flex items-start justify-between gap-3">
            <Link href={profileHref} aria-hidden tabIndex={-1} className="shrink-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS/CDN hosts
                <img
                  src={avatar}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                  className="size-14 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid size-14 place-items-center rounded-full text-lg font-semibold text-white/95"
                  style={{ backgroundColor: m.bg }}
                >
                  {m.char}
                </span>
              )}
            </Link>
            <FollowButton targetDid={did} name={name} />
          </div>

          <div className="mt-3">
            <Link href={profileHref} className="group/name block focus-visible:outline-none">
              <p className="truncate text-[15px] font-semibold leading-tight text-foreground group-hover/name:underline group-focus-visible/name:underline">
                {name}
              </p>
              {handle ? <p className="truncate text-sm text-muted-foreground">{handle}</p> : null}
            </Link>
          </div>

          <FollowStats targetDid={did} className="mt-2" />

          {bio ? (
            <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
              {bio}
            </p>
          ) : null}
        </FollowProvider>
      </HoverCardContent>
    </HoverCard>
  );
}
