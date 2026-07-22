"use client";

/**
 * In-feed photo lightbox. Clicking an image in the feed (a row's cover photo or
 * a sighting thumbnail in a summary card) opens this overlay instead of
 * navigating away, so the viewer can look at the photo and like / comment it
 * right there. It reuses the feed's shared FeedInteractions instance, so a like
 * made here is the same record and the same count the row's action bar shows.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, UserIcon, XIcon } from "lucide-react";
import type { ActivityFeedItem } from "../_lib/feed";
import { MentionText } from "@/app/_components/MentionText";
import { resolveBlobUrl } from "../_lib/pds";
import { formatRelative } from "../_lib/format";
import { FeedActionBar, type FeedInteractions } from "./FeedActions";
import { AccountHoverCard } from "@/app/_components/AccountHoverCard";
import { ResolvedAvatar } from "./ResolvedAvatar";

export function FeedImageLightbox({
  item,
  signedIn,
  interactions,
  onClose,
}: {
  item: ActivityFeedItem | null;
  signedIn: boolean;
  interactions: FeedInteractions;
  onClose: () => void;
}) {
  const t = useTranslations("common.feed");
  const [resolved, setResolved] = useState<string | null>(null);

  // Resolve the image (an external URL, or a PDS blob ref) each time a new
  // item opens.
  useEffect(() => {
    setResolved(null);
    if (!item || item.imageUrl || !item.actorDid || !item.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(item.actorDid, item.imageRef, controller.signal)
      .then((url) => setResolved(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolved(null);
      });
    return () => controller.abort();
  }, [item]);

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [item, onClose]);

  if (!item) return null;
  const src = item.imageUrl ?? resolved;
  const name = item.actorName?.trim() || t("anonymous");

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={item.title ?? name}
    >
      <button
        type="button"
        aria-label={t("actions.closeImage")}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/60 backdrop-blur-sm"
      />
      <div className="relative z-[1] flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
        {/* Header: who shared it + close */}
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <AccountHoverCard
            did={item.actorDid}
            name={item.actorName}
            avatarRef={item.actorAvatarRef}
            triggerClassName="shrink-0"
          >
            <ResolvedAvatar
              did={item.actorDid}
              avatarRef={item.actorAvatarRef}
              name={item.actorName}
              fallbackIcon={<UserIcon className="size-4" />}
              className="size-9"
              sizes="36px"
            />
          </AccountHoverCard>
          <div className="min-w-0 flex-1">
            <AccountHoverCard
              did={item.actorDid}
              name={item.actorName}
              avatarRef={item.actorAvatarRef}
              triggerClassName="block min-w-0 max-w-full"
            >
              <span className="block truncate text-sm font-medium text-foreground hover:underline">{name}</span>
            </AccountHoverCard>
            <p className="truncate text-xs text-muted-foreground">{formatRelative(item.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("actions.closeImage")}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Photo */}
        <div className="grid w-full place-items-center bg-muted">
          {src ? (
            <Image
              src={src}
              alt={item.title ?? ""}
              width={1200}
              height={900}
              unoptimized
              sizes="(max-width: 672px) 100vw, 672px"
              className="h-auto max-h-[60vh] w-full object-contain"
            />
          ) : (
            <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
          )}
        </div>

        {/* Caption + like / comment + a way through to the full record */}
        <div className="overflow-y-auto border-t border-border/50 px-4 py-3">
          {item.title ? (
            <p className="text-[15px] font-medium leading-snug text-foreground">{item.title}</p>
          ) : null}
          {item.text ? (
            <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              <MentionText text={item.text} mentions={item.mentions} />
            </p>
          ) : null}
          <FeedActionBar subjectUri={item.id} signedIn={signedIn} interactions={interactions} />
          <Link
            href={item.href}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t("actions.viewDetails")}
            <ArrowUpRightIcon className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
