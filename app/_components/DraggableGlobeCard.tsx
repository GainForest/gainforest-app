"use client";

import Link from "next/link";
import { LogoMark } from "./Logo";
import { useDraggableDocPos } from "../_lib/useDraggableDocPos";
import { useT } from "./LocaleProvider";

// Wraps the live globe (`<GlobeCard>`) in the same window-chrome card style
// as `<BumicertsCard>` and makes it draggable. Visual rules:
//
//   - cream/beige body and warm-beige border that match the Bumicerts card;
//   - header doubles as the drag handle (cursor reflects the drag state);
//   - "Live" badge in the header to advertise the running data feed;
//   - footer links out to the full-fidelity globe at gainforest.app.
//
// Drag mechanics come from the shared `useDraggableDocPos` hook so the
// behaviour matches the Bumicerts card exactly: document-coordinate
// positioning that scrolls with the page, anchor-driven default home, and
// localStorage persistence.
//
// Children = the actual globe-card render. We accept it as `children` rather
// than constructing it inside this client component so the async server
// fetch in `<GlobeCard>` (which pulls live pins via `fetchProjectPins()`)
// stays a server-rendered concern.
//
// `inline` mode (mobile): render the same chrome but without absolute
// positioning, dragging, or fixed width — so the card flows naturally in
// the document. The mobile composition in `<Hero />` mounts this variant
// directly under the hero copy.

const STORAGE_KEY = "gainforest.globeCard.docPos.v7";
const ANCHOR_ID = "globe-card-anchor";
const CARD_WIDTH = 280;
const GLOBE_HREF = "https://gainforest.app";

interface Props {
  children: React.ReactNode;
  /** Number of project pins on the globe (for the footer). */
  pinCount?: number;
  /** When true, render inline (no absolute positioning, no drag). */
  inline?: boolean;
}

export function DraggableGlobeCard(props: Props) {
  if (props.inline) {
    return <InlineGlobeCard {...props} />;
  }
  return <AbsoluteDraggableGlobeCard {...props} />;
}

function AbsoluteDraggableGlobeCard({ children, pinCount }: Props) {
  const { docPos, dragging, rootRef, handleProps } = useDraggableDocPos({
    storageKey: STORAGE_KEY,
    anchorId: ANCHOR_ID,
    width: CARD_WIDTH,
  });

  if (!docPos) return null;

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: docPos.x,
        top: docPos.y,
        width: CARD_WIDTH,
        zIndex: 39, // one below the Bumicerts card so they layer naturally
        willChange: "left, top",
      }}
      className="overflow-hidden rounded-[18px] border border-[#e6dfd0] bg-[#fbf8f0] shadow-[0_30px_70px_-25px_rgba(40,50,30,0.35)]"
    >
      <GlobeCardChrome
        dragging={dragging}
        handleProps={handleProps}
        draggable
        pinCount={pinCount}
      >
        {children}
      </GlobeCardChrome>
    </div>
  );
}

function InlineGlobeCard({ children, pinCount }: Props) {
  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[18px] border border-[#e6dfd0] bg-[#fbf8f0] shadow-[0_18px_40px_-22px_rgba(40,50,30,0.28)]">
      <GlobeCardChrome pinCount={pinCount}>{children}</GlobeCardChrome>
    </div>
  );
}

interface ChromeProps {
  children: React.ReactNode;
  pinCount?: number;
  dragging?: boolean;
  draggable?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleProps?: any;
}

function GlobeCardChrome({
  children,
  pinCount,
  dragging,
  draggable,
  handleProps,
}: ChromeProps) {
  const t = useT();
  return (
    <>
      {/* header — drag handle (only when draggable) */}
      <div
        className={
          "flex items-center gap-2 px-5 pt-5 pb-3 select-none " +
          (draggable
            ? dragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : "")
        }
        style={draggable ? { touchAction: "none" } : undefined}
        {...(draggable ? handleProps : {})}
        aria-label={draggable ? "Drag handle" : undefined}
      >
        <LogoMark
          className="h-[22px] w-[22px] text-primary"
          title="GainForest"
        />
        <span className="font-garamond text-[20px] font-medium text-foreground">
          {t("nav.globe")}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-primary"
          title="Real ATProto-sourced pins"
          data-no-drag
        >
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Live
        </span>
      </div>

      {/* body: the live globe canvas, centered. Padding is tight so the
          sphere fills the card body width. */}
      <div className="grid place-items-center px-2 pb-2" data-no-drag>
        {children}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-[#ece5d4] px-4 py-2.5 text-[11px]">
        <span className="text-foreground/55">
          {typeof pinCount === "number"
            ? t("card.projectsWorldwide").replace("{n}", String(pinCount))
            : t("card.worldwide")}
        </span>
        <Link
          href={GLOBE_HREF}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-primary"
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
