"use client";

/**
 * Notification bell — a small button in the header, next to the account avatar,
 * that shows likes and comments other people left on the signed-in viewer's
 * records, plus posts and comments that @-mention the viewer. The unread badge
 * polls in the background; opening the panel marks
 * everything seen (writing app.gainforest.notification.seen / rkey "self" to the
 * viewer's repo) so the badge clears.
 *
 * Hidden entirely when signed out — there's nothing to notify about.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AtSignIcon, BellIcon, HeartIcon, MessageCircleIcon, MicroscopeIcon, UserIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import type { AuthSession } from "../_lib/auth";
import { NOTIFICATION_SEEN_COLLECTION, type NotificationItem } from "../_lib/notifications";
import { useNotifications } from "@/hooks/useNotifications";
import { putRecord } from "@/app/(manage)/manage/_lib/mutations";
import { formatRelative } from "../_lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResolvedAvatar } from "@/app/feed/ResolvedAvatar";
import { cn } from "@/lib/utils";

export function NotificationBell({ session }: { session: AuthSession | null }) {
  const t = useTranslations("common.notifications");
  const enabled = session?.isLoggedIn === true;
  const { data } = useNotifications(enabled);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Snapshot the last-seen timestamp when the panel opens, so rows stay
  // highlighted as "new" for this viewing even after marking them seen.
  const [seenSnapshot, setSeenSnapshot] = useState<string | null>(null);
  const markingRef = useRef(false);

  if (!enabled) return null;

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  async function markSeen() {
    if (markingRef.current) return;
    markingRef.current = true;
    try {
      await putRecord(NOTIFICATION_SEEN_COLLECTION, "self", {
        $type: NOTIFICATION_SEEN_COLLECTION,
        seenAt: new Date().toISOString(),
      });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      // Non-fatal: the badge simply stays until the next successful mark.
    } finally {
      markingRef.current = false;
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSeenSnapshot(data?.seenAt ?? null);
      if (unreadCount > 0) void markSeen();
    }
  }

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);
  const ariaLabel = unreadCount > 0 ? t("unreadAria", { count: unreadCount }) : t("ariaLabel");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <BellIcon className="size-4" aria-hidden />
          {unreadCount > 0 ? (
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
              aria-hidden
            >
              {badgeLabel}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold text-foreground">{t("title")}</span>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{t("empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("emptyHint")}</p>
          </div>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                isUnread={!seenSnapshot || item.createdAt > seenSnapshot}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  item,
  isUnread,
  onNavigate,
}: {
  item: NotificationItem;
  isUnread: boolean;
  onNavigate: () => void;
}) {
  const t = useTranslations("common.notifications");
  const subjectLabel = t(`subject.${item.subjectKind}`);
  const actor = item.actorName || t("someone");
  const action =
    item.kind === "like"
      ? t("likedYour", { subject: subjectLabel })
      : item.kind === "mention"
        ? t("mentionedYou")
        : item.kind === "identification"
          ? t("identifiedYour", { subject: subjectLabel })
          : t("commentedYour", { subject: subjectLabel });

  const body = (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors",
        isUnread ? "bg-primary/5" : "bg-transparent",
        item.subjectHref && "hover:bg-muted/60",
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        <ResolvedAvatar
          did={item.actorDid}
          avatarRef={item.actorAvatarRef}
          name={item.actorName}
          fallbackIcon={<UserIcon className="size-3.5" />}
          className="size-8"
          sizes="32px"
        />
        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-background text-primary ring-1 ring-border">
          {item.kind === "like" ? (
            <HeartIcon className="size-2.5 fill-current" aria-hidden />
          ) : item.kind === "mention" ? (
            <AtSignIcon className="size-2.5" aria-hidden />
          ) : item.kind === "identification" ? (
            <MicroscopeIcon className="size-2.5" aria-hidden />
          ) : (
            <MessageCircleIcon className="size-2.5" aria-hidden />
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">
          <span className="font-medium">{actor}</span> {action}
        </p>
        {item.text ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.text}</p>
        ) : null}
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">{formatRelative(item.createdAt)}</p>
      </div>
      {isUnread ? (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      ) : null}
    </div>
  );

  return (
    <li className="border-b border-border/60 last:border-b-0">
      {item.subjectHref ? (
        <Link
          href={item.subjectHref}
          onClick={onNavigate}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
