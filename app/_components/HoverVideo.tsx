"use client";

import { useEffect, useRef, useState } from "react";

// Shared "ambient B-roll" video card — used by EquitableAI and
// TainaFeature.
//
// Behaviour:
//   - Default: shows the poster image inside the <video>, paused. A
//     small italic duration label (e.g. "0:15") sits in the
//     bottom-right corner as a quiet visual invitation.
//   - Desktop hover: video plays (looped, muted by default) until
//     the cursor leaves the card, then pauses on the last frame.
//   - Tap on touch devices: toggles play / pause.
//   - Top-right corner: a small speaker icon button that toggles
//     mute. The button stops propagation so clicking it never
//     triggers the card's own play / pause toggle.
//   - The card never plays without an intentional gesture (no
//     IntersectionObserver autoplay, no on-mount play), which fits
//     the editorial "restrained motion" rule and is the explicit
//     ask from the team.
//
// The duration + mute button both render in white with a soft drop
// shadow so they read on whatever frame the documentary lands on.
// The cursor switches to `pointer` so the card reads as interactive.
// We don't show a heavy play-button circle — the duration label +
// cursor change is the affordance.
//
// All visuals use design tokens (border-border-soft, bg-ink) rather
// than raw hex values per AGENTS.md.

type HoverVideoProps = {
  src: string;
  poster: string;
  /** Used for the <video> aria-label. */
  ariaLabel: string;
  /** Duration label displayed bottom-right, e.g. "0:15". */
  durationLabel?: string;
  /** Tailwind aspect-ratio class, default 4:5 portrait. */
  aspectClass?: string;
  /** Tailwind radius / extra classes for the outer card. */
  className?: string;
};

export function HoverVideo({
  src,
  poster,
  ariaLabel,
  durationLabel = "0:15",
  aspectClass = "aspect-[4/5]",
  className = "",
}: HoverVideoProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Survives renders without re-triggering effects — used to remember
  // a hover/click that arrived before the <video src> was attached.
  const pendingPlayRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  // Default muted — required by every major browser's autoplay policy
  // for hover-triggered playback. Clicking the speaker icon flips it.
  const [muted, setMuted] = useState(true);
  // Lazy-attach the <video src> only when the card is near the
  // viewport. Until then we render the poster image only, which keeps
  // the page-load footprint at ~60 KB per card instead of ~500 KB of
  // speculative H.264 moov metadata across all four cards. Once the
  // user scrolls within 300 px of the card we upgrade to
  // preload="metadata" so the first hover plays without a stall.
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // SSR / very old browsers: just activate immediately so the card
    // still works — the IO bail is the safe upgrade path.
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          obs.disconnect();
        }
      },
      // 300 px lead so the metadata is in flight by the time the
      // card actually crosses the fold — keeps first-hover snappy.
      { rootMargin: "300px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function play() {
    const v = videoRef.current;
    if (!v) return;
    // If the user hovers before IntersectionObserver has activated
    // the card (initial-viewport cards, fast cursors), remember the
    // intent and force-activate. The effect below will drive play()
    // once the src is attached on the next render.
    if (!active) {
      pendingPlayRef.current = true;
      setActive(true);
      return;
    }
    // play() returns a Promise that rejects if the browser blocks the
    // play attempt (rare with muted videos but possible on Safari
    // before any user gesture). Swallow the rejection — the worst
    // case is the poster stays put, which is still a valid state.
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {});
  }

  // Flush a pending play intent once the <video src> upgrade lands.
  useEffect(() => {
    if (!active || !pendingPlayRef.current) return;
    pendingPlayRef.current = false;
    play();
    // play() reads `active` to short-circuit — by the time this
    // effect runs, `active` is true and play() will call v.play()
    // directly. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  function pause() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
  }
  function toggle() {
    if (playing) pause();
    else play();
  }
  function toggleMute(e: React.MouseEvent) {
    // Don't let the click bubble to the card's onClick (which would
    // toggle play / pause).
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    const v = videoRef.current;
    if (v) {
      v.muted = next;
      // If the user unmutes while the card is idle, also start
      // playing — it's the natural next gesture and matches how
      // gainforest.earth's tiles behave.
      if (!next && v.paused) play();
    }
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={play}
      onMouseLeave={pause}
      onClick={toggle}
      className={`group relative cursor-pointer overflow-hidden border border-border-soft bg-ink ${aspectClass} ${className}`}
    >
      <video
        ref={videoRef}
        // Lazy-load: until the card is in (or near) the viewport,
        // src is undefined and preload is "none" — the poster
        // attribute carries the visual on its own.
        src={active ? src : undefined}
        poster={poster}
        muted={muted}
        loop
        playsInline
        preload={active ? "metadata" : "none"}
        aria-label={ariaLabel}
        // Smooth zoom on hover for tactile presence — well within the
        // "restrained motion" rule (1 -> 1.015 over 600ms ease).
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.015]"
      />

      {/* Subtle bottom shade so any documentary subtitles baked into
          the video frames don't fight typography sitting beneath the
          card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-b from-transparent to-black/20"
      />

      {/* Mute / unmute button — small, top-right, doesn't bubble to
          card click. We toggle the icon based on `muted`. */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Unmute video" : "Mute video"}
        title={muted ? "Unmute" : "Mute"}
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        {muted ? <IconVolumeOff /> : <IconVolumeOn />}
      </button>

      {/* Duration label — quiet bottom-right pill. Fades while
          playing so it doesn't compete with the moving image. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-3 right-3 font-instrument italic text-[11px] tracking-[0.06em] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] transition-opacity duration-500 ${
          playing ? "opacity-0" : "opacity-100"
        }`}
      >
        {durationLabel}
      </span>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────
//
// Lucide-style stroke icons rendered inline so we don't pay for the
// whole Lucide bundle just for two glyphs. 14px in a 32px button feels
// right next to the small editorial typography.

function IconVolumeOff() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" x2="17" y1="9" y2="15" />
      <line x1="17" x2="23" y1="9" y2="15" />
    </svg>
  );
}

function IconVolumeOn() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
