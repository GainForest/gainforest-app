"use client";

// 3D coverflow carousel for the featured projects shelf, adapted from
// researchretreat's ImpactExperience (itself from simocracy-v2's
// sim-carousel) — the active card sits front and center while the
// neighbouring featured projects stay visible, tilted back at the sides.
// The stack can be dragged (click / touch) with the cards tracking the
// pointer continuously, snapping to the nearest card on release. Clicking
// the active card runs the usual photo-morph navigation to its project page.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ProjectRecord } from "../../_lib/indexer";

type CardStyle = {
  translateX: string;
  rotateY: number;
  translateZ: number;
  scale: number;
  opacity: number;
  zIndex: number;
  hidden: boolean;
};

// Coverflow anchor poses at integer offsets 0 / ±1 / ±2 (+ a vanish pose at
// ±3). Fractional offsets — produced while dragging — are linearly
// interpolated between the neighbouring anchors so the cards track the
// pointer continuously.
const POSES = [
  { x: 0, rot: 0, z: 0, scale: 1, opacity: 1 },
  { x: 62, rot: 25, z: -160, scale: 0.85, opacity: 0.65 },
  { x: 112, rot: 35, z: -260, scale: 0.7, opacity: 0.35 },
  { x: 150, rot: 40, z: -340, scale: 0.6, opacity: 0 },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getCardStyle(offset: number): CardStyle {
  const abs = Math.abs(offset);
  if (abs >= 3) {
    return { translateX: "0%", rotateY: 0, translateZ: 0, scale: 1, opacity: 0, zIndex: 0, hidden: true };
  }
  const side = offset < 0 ? -1 : 1;
  const i = Math.min(Math.floor(abs), POSES.length - 2);
  const t = abs - i;
  const a = POSES[i];
  const b = POSES[i + 1];
  return {
    translateX: `${side * lerp(a.x, b.x, t)}%`,
    rotateY: -side * lerp(a.rot, b.rot, t),
    translateZ: lerp(a.z, b.z, t),
    scale: lerp(a.scale, b.scale, t),
    opacity: lerp(a.opacity, b.opacity, t),
    zIndex: 5 - Math.round(abs),
    hidden: false,
  };
}

// Card sizing: measure the container and clamp the card width so the side
// previews never overflow small screens.
const MIN_CARD_W = 200;
const MAX_CARD_W = 280;
const CARD_ASPECT = 8 / 5; // matches ProjectShowcaseCard's aspect-[5/8]
// Drag tuning: movement below the slop is a click; one card step is the ±62%
// translate of the first side pose; releases past the catch fraction advance
// even without a full step.
const CLICK_SLOP_PX = 6;
const STEP_RATIO = 0.62;
const CATCH_FRACTION = 0.15;

export function ProjectCoverflow({
  records,
  renderCard,
}: {
  records: ProjectRecord[];
  /** Render one card. `isActive` / `frozen` map onto ProjectShowcaseCard. */
  renderCard: (record: ProjectRecord, index: number, isActive: boolean, frozen: boolean) => ReactNode;
}) {
  const t = useTranslations("marketplace.projects.featured");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState<number>(MAX_CARD_W);

  // Click-and-drag: dragPx follows the pointer while grabbing, and is
  // converted into a fractional index shift for the card poses.
  const dragRef = useRef<{ pointerId: number; startX: number; dragging: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      // The side cards translate by ±62% / ±112%, so the visible stack is
      // about 2.2 card-widths wide. Fit that (plus arrow gutters) on sm+;
      // on phones let the active card take most of the width instead — the
      // side previews just peek from the clipped edges.
      const isPhone = window.innerWidth < 640;
      const arrowReserve = isPhone ? 16 : 88;
      const divisor = isPhone ? 1.35 : 1.7;
      const fit = Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, Math.floor((w - arrowReserve) / divisor)));
      setCardWidth(fit);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const carouselHeight = Math.round(cardWidth * CARD_ASPECT) + 24;
  const safeActive = Math.min(Math.max(activeIndex, 0), records.length - 1);
  const stepPx = cardWidth * STEP_RATIO;
  // Fractional shift of the whole stack while dragging (drag left → positive
  // → next card approaches center). Rubber-band at the ends: past the
  // first/last card the stack only follows at 25%.
  let dragShift = isDragging ? -dragPx / stepPx : 0;
  {
    const last = records.length - 1;
    let center = safeActive + dragShift;
    if (center < 0) center *= 0.25;
    else if (center > last) center = last + (center - last) * 0.25;
    dragShift = center - safeActive;
  }

  const navigate = (next: number) => {
    setActiveIndex(Math.max(0, Math.min(records.length - 1, next)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") navigate(safeActive - 1);
    else if (event.key === "ArrowRight") navigate(safeActive + 1);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, dragging: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.dragging) {
      if (Math.abs(dx) < CLICK_SLOP_PX) return;
      // Passed the slop → this is a drag, not a click. Capture the pointer so
      // the grab survives leaving the carousel, and swallow the click that
      // would otherwise open the card on release.
      drag.dragging = true;
      suppressClickRef.current = true;
      setIsDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic or already-released pointer — drag still works */
      }
    }
    setDragPx(dx);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.dragging) return;
    const frac = -(event.clientX - drag.startX) / stepPx;
    let steps = Math.round(frac);
    if (steps === 0 && Math.abs(frac) > CATCH_FRACTION) steps = Math.sign(frac);
    navigate(safeActive + steps);
    setIsDragging(false);
    setDragPx(0);
    // The click event fires right after pointerup — let the capture handler
    // swallow it, then re-arm.
    setTimeout(() => (suppressClickRef.current = false), 0);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-11 w-11 shrink-0 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-border bg-background text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 sm:grid";

  return (
    <div ref={containerRef}>
      <div
        className={cn(
          "relative w-full touch-pan-y overflow-hidden outline-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ perspective: "1300px", height: carouselHeight }}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={t("title")}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
      >
        <button
          type="button"
          onClick={() => navigate(safeActive - 1)}
          disabled={safeActive <= 0}
          aria-label={t("previous")}
          className={`${arrowClass} start-0 ms-1`}
        >
          <ChevronLeftIcon className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => navigate(safeActive + 1)}
          disabled={safeActive >= records.length - 1}
          aria-label={t("next")}
          className={`${arrowClass} end-0 me-1`}
        >
          <ChevronRightIcon className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative h-full w-full" style={{ transformStyle: "preserve-3d" }}>
          {records.map((record, index) => {
            const discreteOffset = index - safeActive;
            const style = getCardStyle(discreteOffset - dragShift);
            return (
              <div
                key={record.id}
                className={cn("absolute left-1/2 top-1/2", !isDragging && "transition-all duration-500 ease-out")}
                style={{
                  width: cardWidth,
                  transform: `translateX(-50%) translateY(-50%) translateX(${style.translateX}) rotateY(${style.rotateY}deg) translateZ(${style.translateZ}px) scale(${style.scale})`,
                  opacity: style.opacity,
                  zIndex: style.zIndex,
                  pointerEvents: discreteOffset === 0 ? "auto" : "none",
                  display: style.hidden ? "none" : "block",
                }}
              >
                {renderCard(record, index, discreteOffset === 0, isDragging)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      {records.length > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-2.5">
          {records.map((record, index) => (
            <button
              key={record.id}
              type="button"
              onClick={() => navigate(index)}
              aria-label={t("goTo", { title: record.title })}
              aria-current={index === safeActive}
              className={cn(
                "relative h-1.5 rounded-full transition-all",
                index === safeActive ? "w-[26px] bg-primary" : "w-2 bg-border hover:bg-primary/40",
              )}
            >
              <span aria-hidden className="absolute inset-0 -mx-1 -my-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
