"use client";

/**
 * In-feed photo dialog. It shares the feed interaction state so likes and
 * comments stay in sync with the timeline row.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, UserIcon, XIcon } from "lucide-react";
import type { ActivityFeedItem } from "../_lib/feed";
import { MentionText } from "@/app/_components/MentionText";
import { resolveBlobUrl } from "../_lib/pds";
import { formatRelative } from "../_lib/format";
import { FeedActionBar, type FeedInteractions } from "./FeedActions";
import { AccountHoverCard } from "@/app/_components/AccountHoverCard";
import { ResolvedAvatar } from "./ResolvedAvatar";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPlaceholder,
  DialogTitle,
} from "@/components/ui/modal/dialog";

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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (item && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, [item]);

  if (!item) return null;
  const src = item.imageUrl ?? resolved;
  const name = item.actorName?.trim() || t("anonymous");

  const closeAndRestoreFocus = () => {
    const target = returnFocusRef.current;
    onClose();
    requestAnimationFrame(() => target?.focus());
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeAndRestoreFocus();
      }}
    >
      <DialogPlaceholder
        dialogWidth="max-w-2xl"
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButtonRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">{item.title ?? name}</DialogTitle>
        <DialogDescription className="sr-only">{formatRelative(item.createdAt)}</DialogDescription>

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
          <DialogClose asChild>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t("actions.closeImage")}
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </DialogClose>
        </div>

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
            <div className="aspect-[4/3] w-full animate-pulse bg-muted motion-reduce:animate-none" />
          )}
        </div>

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
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t("actions.viewDetails")}
            <ArrowUpRightIcon className="size-3" />
          </Link>
        </div>
      </DialogPlaceholder>
    </Dialog>
  );
}
