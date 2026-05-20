"use client";

import { useRef, useState } from "react";

// Shared "ambient B-roll" video card — used by EquitableAI and
// TainaFeature.
//
// Behaviour:
//   - Default: shows the poster image inside the <video>, paused. A
//     small italic duration label (e.g. "0:15") sits in the
//     bottom-right corner as a quiet visual invitation.
//   - Desktop hover: video plays (muted, looped) until the cursor
//     leaves the card, then pauses on the last frame.
//   - Tap on touch devices: toggles play / pause.
//   - The card never plays without an intentional gesture (no
//     IntersectionObserver autoplay, no on-mount play), which fits
//     the editorial "restrained motion" rule and is the explicit
//     ask from the team.
//
// The duration label fades out smoothly while playing so it doesn't
// fight the moving image; the cursor switches to `pointer` so the
// card reads as interactive. We don't show a heavy play-button
// circle — the duration label + cursor change is the affordance.
//
// All visuals use design tokens (border-border-soft, bg-ink) rather
// than raw hex values per AGENTS.md.

type HoverVideoProps = {
  src: string;
  poster: string;
  /** Used for both aria-label and the visible duration label. */
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function play() {
    const v = videoRef.current;
    if (!v) return;
    // play() returns a Promise that rejects if the browser blocks the
    // play attempt (rare with muted videos but possible on Safari
    // before any user gesture). Swallow the rejection — the worst
    // case is the poster stays put, which is still a valid state.
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {});
  }
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

  return (
    <div
      onMouseEnter={play}
      onMouseLeave={pause}
      onClick={toggle}
      className={`group relative cursor-pointer overflow-hidden border border-border-soft bg-ink ${aspectClass} ${className}`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
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
