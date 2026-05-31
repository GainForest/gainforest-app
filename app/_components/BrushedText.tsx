import { Fragment, type ReactNode } from "react";

// Single arced brush sweep, ported verbatim from gainforest-app's
// BrushedText (itself from the Bumicerts "Real Communities" hero on
// certs.gainforest.app). Drawn as a STROKED cubic curve with rounded caps,
// which is what gives it the visible hand-drawn arc.
const BRUSH_PATH = "M 3 10.5 C 44 6.5 87 6 175 8.5";
const BRUSH_VIEWBOX = "0 0 178 16";

function parseBrushed(text: string): Array<{ brushed?: true; text: string }> {
  const segments: Array<{ brushed?: true; text: string }> = [];
  let last = 0;
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ brushed: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/** Render a string with `{phrase}` markers; the marked phrase gets the
 *  curved hand-drawn brush stroke beneath it. */
export function BrushedText({ text }: { text: string }): ReactNode {
  return parseBrushed(text).map((seg, i) =>
    seg.brushed ? (
      <span key={i} className="relative inline-block">
        <span className="relative z-[1]">{seg.text}</span>
        <svg
          aria-hidden
          preserveAspectRatio="none"
          viewBox={BRUSH_VIEWBOX}
          className="brush-svg"
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
      <Fragment key={i}>{seg.text}</Fragment>
    ),
  );
}
