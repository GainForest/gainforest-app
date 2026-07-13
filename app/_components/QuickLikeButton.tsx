"use client";

import { useEffect, useState } from "react";
import { useT } from "./LocaleProvider";

/**
 * QuickLikeButton — the small heart overlay pinned to the bottom-right
 * corner of gallery thumbnails ("quick like").
 *
 * UX decisions baked in:
 *
 * - **Always visible**, not hover-revealed. Hover-reveal hides the
 *   affordance completely on touch devices (most of our traffic), and
 *   discoverability is the whole point of a quick-like.
 * - **Bottom-right, over the existing scrim.** The Media cards already
 *   paint a bottom gradient scrim, and the date pill owns top-right,
 *   so bottom-right is the free corner with guaranteed contrast.
 * - **36 px visual circle, larger hit target.** A transparent
 *   `before` halo extends the tap area to ~48 px without inflating
 *   the visual footprint (Apple/Android minimum-target guidance).
 * - **Never navigates.** The heart usually lives inside a card that is
 *   itself a link; `preventDefault` + `stopPropagation` keep the like
 *   from opening the card.
 * - **Sage, not red.** Liked state fills with `--primary`; the palette
 *   rule in AGENTS.md reserves accents for the sage token and the only
 *   red slot is `--destructive`, which would be semantically wrong.
 * - **Pop animation** on like (not on unlike), disabled under
 *   `prefers-reduced-motion` via the keyframes guard in globals.css.
 *
 * Persistence is `localStorage` only — a visitor-private bookmark, not
 * upstream data, so it doesn't violate the "no fake data" rule (there
 * is no like backend on the landing). All mounted hearts stay in sync
 * through a window CustomEvent; other tabs sync via the `storage`
 * event.
 */

const STORAGE_KEY = "gainforest.quickLikes.v1";
const CHANGE_EVENT = "gf:quicklike-change";

function readLikes(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeLikes(likes: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...likes]));
  } catch {
    // Private-mode / quota failures: the in-page state still updates
    // via the change event; persistence is best-effort.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function QuickLikeButton({
  id,
  className = "",
}: {
  /** Stable identifier for the liked item (e.g. the card's key/slug). */
  id: string;
  /** Positioning classes from the caller, e.g. "absolute bottom-3 right-3". */
  className?: string;
}) {
  const t = useT();
  // false on the server and first client paint (hydration-safe); the
  // effect below reconciles with localStorage right after mount.
  const [liked, setLiked] = useState(false);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    const sync = () => setLiked(readLikes().has(id));
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [id]);

  const toggle = (e: React.MouseEvent) => {
    // The heart lives inside link cards — never follow the link.
    e.preventDefault();
    e.stopPropagation();
    const likes = readLikes();
    if (likes.has(id)) {
      likes.delete(id);
    } else {
      likes.add(id);
      setPop(true);
    }
    writeLikes(likes);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? t("quickLike.unlike") : t("quickLike.like")}
      title={liked ? t("quickLike.unlike") : t("quickLike.like")}
      className={
        // The before-halo widens the touch target to ~48px while the
        // visible circle stays 36px. NOTE: no `relative` here — the
        // caller owns positioning (usually `absolute bottom-3 right-3`),
        // and a baked-in `relative` would fight it in the cascade.
        "group/like z-10 grid h-9 w-9 place-items-center rounded-full " +
        "border border-border-soft bg-background/90 shadow-[0_4px_14px_-6px_rgba(40,50,30,0.35)] " +
        "backdrop-blur-sm transition-colors " +
        "before:absolute before:-inset-1.5 before:rounded-full before:content-[''] " +
        "hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
        (liked ? "text-primary " : "text-foreground/55 hover:text-primary ") +
        className
      }
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        aria-hidden
        onAnimationEnd={() => setPop(false)}
        className={pop ? "gf-heart-pop" : undefined}
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19.5 12.57 12 20l-7.5-7.43A5 5 0 1 1 12 6.01a5 5 0 1 1 7.5 6.57Z" />
      </svg>
    </button>
  );
}
