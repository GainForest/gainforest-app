"use client";

/**
 * Small shared pieces for the Events surfaces: attendee face stacks, the
 * per-state RSVP trailing control, and the loading skeleton card.
 */

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { EventAccountCard } from "../_lib/adapter";
import type { ViewerRsvpState } from "@/app/_lib/community-events";

export function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "•";
}

export function AvatarFace({
  card,
  className = "size-8",
}: {
  card: EventAccountCard | null;
  className?: string;
}) {
  if (card?.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- PDS blob URL resolved at runtime; hosts are unbounded.
    return <img src={card.avatarUrl} alt="" className={`${className} shrink-0 rounded-full border border-border-soft object-cover`} />;
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-full border border-border-soft bg-primary/10 text-xs font-semibold text-primary`} aria-hidden>
      {initialOf(card?.displayName)}
    </span>
  );
}

/** Overlapping attendee faces with a "+N" overflow bubble. */
export function FaceStack({
  dids,
  cards,
  max = 3,
  size = "size-7",
}: {
  dids: string[];
  cards: Map<string, EventAccountCard>;
  max?: number;
  size?: string;
}) {
  if (dids.length === 0) return null;
  const shown = dids.slice(0, max);
  const overflow = dids.length - shown.length;
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((did) => (
        <span key={did} className="rounded-full ring-2 ring-surface">
          <AvatarFace card={cards.get(did) ?? null} className={size} />
        </span>
      ))}
      {overflow > 0 ? (
        <span className={`${size} grid place-items-center rounded-full border border-border-soft bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-surface`}>
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The trailing control on a card, by state — the only interactive element on
 * a card besides the card itself. "RSVP" / "Join waitlist" act in place;
 * "You're going" / "On the waitlist" open the event (cancel lives there).
 */
export function RsvpTrailingControl({
  state,
  busy,
  onRsvp,
}: {
  state: ViewerRsvpState;
  busy: boolean;
  onRsvp: (() => void) | null;
}) {
  const t = useTranslations("events.card");

  if (state === "finished" || state === "cancelled") {
    return (
      <span className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold text-muted-foreground">
        {state === "finished" ? t("finished") : t("cancelledShort")}
      </span>
    );
  }
  if (state === "going" || state === "waitlisted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
        {state === "going" ? <CheckIcon className="size-3.5" aria-hidden /> : null}
        {state === "going" ? t("going") : t("waitlisted")}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={busy || !onRsvp}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRsvp?.();
      }}
      className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-60"
    >
      {busy ? "…" : state === "full" ? t("joinWaitlist") : t("rsvp")}
    </button>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="flex animate-pulse gap-4 rounded-3xl border border-border-soft bg-surface p-5">
      <div className="h-20 w-14 shrink-0 rounded-2xl bg-muted" />
      <div className="flex-1 space-y-2.5 py-1">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  );
}
