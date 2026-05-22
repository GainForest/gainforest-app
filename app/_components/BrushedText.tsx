"use client";

import { Fragment, type ReactNode } from "react";

// Single arced brush sweep — ported verbatim from the Bumicerts hero
// at certs.gainforest.app (the "Real Communities" underline the team
// picked as the visual reference). Drawn as a STROKED cubic curve (not
// a filled lens) with rounded line caps, which is what gives it the
// visible arc and soft brush-like ends.
//
// The cubic `M 3 10.5 C 44 6.5 87 6 175 8.5` sweeps from (3, 10.5) on
// the left up through (44, 6.5) and (87, 6) and lands at (175, 8.5) on
// the right — left tip slightly lower, peak around y=6 in the middle,
// right tip a touch higher. The asymmetric arc reads as a hand-drawn
// paint stroke rather than a perfectly symmetric lens.
//
// `preserveAspectRatio="none"` stretches the SVG to the width of the
// brushed word; the arc flattens for wide phrases and steepens for
// narrow ones, which is the trade-off we accept to keep the stroke
// hugging its anchor at any width.
export const BRUSH_PATH = "M 3 10.5 C 44 6.5 87 6 175 8.5";
export const BRUSH_VIEWBOX = "0 0 178 16";

/**
 * Walk a translation string with optional `{word}` markers and return
 * ordered segments. Plain text outside the markers comes through
 * verbatim — spaces and all — so word boundaries render naturally.
 *
 * Originally lived inline in Hero.tsx; extracted here so the About
 * page hero can apply the same brush stroke under its emphasis
 * phrase without forking the parsing logic.
 */
export function parseBrushed(
  text: string,
): Array<{ brushed?: true; text: string }> {
  const segments: Array<{ brushed?: true; text: string }> = [];
  let lastIndex = 0;
  const regex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    segments.push({ brushed: true, text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments;
}

/**
 * Render a string with optional `{phrase}` markers, drawing the
 * curved hand-drawn brush stroke under each marked phrase. The
 * brushed word is wrapped in `position: relative inline-block` with
 * the SVG absolutely-positioned at `-bottom-2`, `h-4`, `w-full`,
 * `preserveAspectRatio="none"`, so the stroke stretches with the
 * word width.
 */
export function BrushedText({ text }: { text: string }): ReactNode {
  const segments = parseBrushed(text);
  return segments.map((segment, i) =>
    segment.brushed ? (
      <span key={i} className="relative inline-block">
        <span className="relative z-[1]">{segment.text}</span>
        <svg
          aria-hidden
          preserveAspectRatio="none"
          viewBox={BRUSH_VIEWBOX}
          className="pointer-events-none absolute left-0 right-0 -bottom-2 z-0 h-4 w-full overflow-visible text-primary"
        >
          <path
            d={BRUSH_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.75}
            strokeLinecap="round"
          />
        </svg>
      </span>
    ) : (
      <Fragment key={i}>{segment.text}</Fragment>
    ),
  );
}
