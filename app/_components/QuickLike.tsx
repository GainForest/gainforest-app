"use client";

/**
 * Quick-like overlay for image thumbnails in galleries.
 *
 * A small heart pinned to the bottom-right corner of a thumbnail lets the
 * viewer like a sighting without opening it — one tap, optimistic fill, done.
 * It reuses the feed's engagement layer (app.gainforest.feed.like), so a like
 * given here is the exact same like shown in /feed, the sighting drawer, and
 * BioBlitz vote tallies.
 *
 * Usage: wrap the gallery once in <QuickLikeProvider uris={…}> (which resolves
 * the viewer and batch-loads like counts for every visible thumbnail in one
 * round-trip), then render <QuickLikeButton subjectUri={…}> inside each card.
 * The provider owns the shared engagement state so memoized cards don't
 * re-render when someone else's like count changes — only the tiny hearts do.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { HeartIcon } from "lucide-react";
import { useFeedInteractions, type FeedInteractions } from "@/app/feed/FeedActions";
import { useViewer } from "@/app/_lib/viewer";
import { redirectToLogin } from "@/app/_lib/auth-client";
import { cn } from "@/lib/utils";

type QuickLikeContextValue = {
  interactions: FeedInteractions;
  signedIn: boolean;
};

const QuickLikeContext = createContext<QuickLikeContextValue | null>(null);

/** Provides one shared engagement store for a gallery and batch-loads the like
 *  state of every thumbnail (deduped inside the interactions layer, so growing
 *  lists only fetch the new URIs). */
export function QuickLikeProvider({ uris, children }: { uris: string[]; children: ReactNode }) {
  const viewer = useViewer();
  const interactions = useFeedInteractions(viewer.sessionDid);
  const { loadEngagement } = interactions;

  // Stable primitive key for the current set of subjects (same pattern as the
  // grid's media-count batching).
  const urisKey = useMemo(
    () => uris.filter((uri) => uri && uri.startsWith("at://")).sort().join("\n"),
    [uris],
  );

  useEffect(() => {
    if (urisKey) loadEngagement(urisKey.split("\n"));
  }, [urisKey, loadEngagement]);

  const value = useMemo(
    () => ({ interactions, signedIn: Boolean(viewer.sessionDid) }),
    [interactions, viewer.sessionDid],
  );

  return <QuickLikeContext.Provider value={value}>{children}</QuickLikeContext.Provider>;
}

const COMPACT = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/**
 * The heart itself. Renders nothing without a provider/direct interaction store
 * or for non-AT subjects, so cards can drop it in unconditionally. Position it via `className`
 * (typically `absolute bottom-2 right-2`).
 *
 * UX notes:
 * - Always visible (galleries are touch-first; hover-only affordances hide the
 *   feature on phones), but kept small and translucent so it doesn't fight the
 *   photo.
 * - Click/keyboard events never bubble to the card, so a quick like never
 *   accidentally opens the record.
 * - Signed-out taps route through sign-in, same as every other like button.
 * - The count only appears once someone has liked, keeping pristine thumbnails
 *   clean.
 */
export function QuickLikeButton({
  subjectUri,
  className,
  interactions: providedInteractions,
  signedIn: providedSignedIn,
  size = "default",
}: {
  subjectUri: string;
  className?: string;
  /** Feed rows already own one shared interaction store, so they can pass it
   *  directly instead of adding a second provider around the timeline. */
  interactions?: FeedInteractions;
  signedIn?: boolean;
  size?: "default" | "sm";
}) {
  const ctx = useContext(QuickLikeContext);
  const t = useTranslations("common.feed.quickLike");
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(false);
  const interactions = providedInteractions ?? ctx?.interactions;
  const signedIn = providedSignedIn ?? ctx?.signedIn ?? false;

  if (!interactions || !subjectUri || !subjectUri.startsWith("at://")) return null;
  const activeInteractions = interactions;

  const engagement = activeInteractions.getEngagement(subjectUri);
  const liked = Boolean(engagement.viewerLikeUri);
  const count = engagement.likeCount;

  async function toggle(event: ReactMouseEvent) {
    // Never let the tap open the card underneath.
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    if (busy) return;
    setBusy(true);
    if (!liked) setPop(true);
    try {
      await activeInteractions.toggleLike(subjectUri);
    } catch {
      // The optimistic overlay already reverted; nothing more to surface here.
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    // Keep Enter/Space from also triggering the card's role="button" handler.
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  }

  return (
    <button
      type="button"
      onClick={(event) => void toggle(event)}
      onKeyDown={onKeyDown}
      aria-pressed={liked}
      aria-label={liked ? t("unlike") : t("like")}
      title={liked ? t("unlike") : t("like")}
      className={cn(
        "z-20 inline-flex cursor-pointer items-center justify-center gap-1 rounded-full bg-black/45 font-semibold text-white shadow-md ring-1 ring-white/25 backdrop-blur-md transition hover:bg-black/60 active:scale-90",
        size === "sm" ? "h-7 min-w-7 px-1.5 text-[11px]" : "h-8 min-w-8 px-2 text-[12px]",
        className,
      )}
    >
      <HeartIcon
        aria-hidden
        onAnimationEnd={() => setPop(false)}
        className={cn(
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
          "transition-colors",
          liked ? "fill-rose-500 text-rose-500" : "text-white",
          pop && "animate-quick-like-pop",
        )}
      />
      {count > 0 ? <span className="tabular-nums">{COMPACT.format(count)}</span> : null}
    </button>
  );
}
