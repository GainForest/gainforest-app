"use client";

import Link from "next/link";
import { GLOBE_URL } from "../_lib/urls";
import { LivePill } from "./LivePill";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

// Wraps the live globe (`<GlobeCard>`) in the same window-chrome card style
// as `<BumicertsCard>`. Visual rules:
//
//   - cream/beige body and warm-beige border that match the Bumicerts card;
//   - "Live" badge in the header to advertise the running data feed;
//   - footer links out to the full-fidelity globe at data.gainforest.app.
//
// Two render modes:
//
//   - `inline` (mobile): natural document flow under the hero copy, no
//     absolute positioning, no drag.
//   - default (desktop): `position: absolute` inside the Hero's right
//     column — positioned via the `position` prop (top/right). This
//     replaces the previous document-coordinate draggable
//     implementation which broke at non-100% browser zoom (cards
//     drifted to the page's left edge).
//
// The card name is retained ("DraggableGlobeCard") for git history /
// import-graph stability even though it no longer drags. If we
// want to bring back interactive dragging later, do it from a
// column-relative starting point, not document coordinates.
//
// Children = the actual globe-card render. We accept it as `children`
// rather than constructing it inside this client component so the
// async server fetch in `<GlobeCard>` (which pulls live pins via
// `fetchProjectPins()`) stays a server-rendered concern.

interface Props {
  children: React.ReactNode;
  /** Number of project pins on the globe (for the footer). */
  pinCount?: number;
  /** When true, render inline (no absolute positioning). */
  inline?: boolean;
  /** When set, render `position: absolute` with these coordinates relative
   *  to the parent (which must be `position: relative`). */
  position?: { top?: number | string; left?: number | string; right?: number | string; width?: number };
}

export function DraggableGlobeCard({
  children,
  pinCount,
  inline = false,
  position,
}: Props) {
  if (inline) {
    return (
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[18px] border border-border-soft bg-surface shadow-[0_18px_40px_-22px_rgba(40,50,30,0.28)]">
        <GlobeCardChrome pinCount={pinCount}>{children}</GlobeCardChrome>
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        top: position?.top,
        left: position?.left,
        right: position?.right,
        width: position?.width ?? 280,
        zIndex: 39, // one below the Bumicerts card so they layer naturally
      }}
      className="overflow-hidden rounded-[18px] border border-border-soft bg-surface shadow-[0_30px_70px_-25px_rgba(40,50,30,0.35)]"
    >
      <GlobeCardChrome pinCount={pinCount}>{children}</GlobeCardChrome>
    </div>
  );
}

interface ChromeProps {
  children: React.ReactNode;
  pinCount?: number;
}

function GlobeCardChrome({ children, pinCount }: ChromeProps) {
  const t = useT();
  return (
    <>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3 select-none">
        <LogoMark
          className="h-[22px] w-[22px] text-brand"
          title="GainForest"
        />
        <span className="font-garamond text-[20px] font-medium text-foreground">
          {t("nav.globe")}
        </span>
        {/* Unified <LivePill /> — same component the ChoosePath cards
            use, with a hover tooltip explaining what's being streamed
            (project pins via the GainForest indexer). */}
        <LivePill
          isLive
          tooltipKey="choosePath.globe.liveTooltip"
          className="ml-auto"
        />
      </div>

      {/* body: the live globe canvas, centered. Padding is tight so the
          sphere fills the card body width. */}
      <div className="grid place-items-center px-2 pb-2" data-no-drag>
        {children}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px]">
        <span className="text-foreground/55">
          {typeof pinCount === "number"
            ? t("card.projectsWorldwide").replace("{n}", String(pinCount))
            : t("card.worldwide")}
        </span>
        <Link
          href={GLOBE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground"
          data-no-drag
        >
          {t("card.openTheGlobe")}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </>
  );
}
