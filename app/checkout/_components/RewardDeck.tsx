"use client";

/**
 * The hand of collectibles a donor receives the moment their checkout settles:
 * one card per project they backed, plus an overall card for multi-project
 * gifts. The cards fan into a layered 3D carousel, the donor flicks between
 * them, then "collects" — one card or all of them.
 *
 * Collecting flies each card on a smooth upward-U arc into the account button
 * in the header (which has morphed into a rounded pocket). The card stays
 * upright and scales down linearly, then descends into a layer clipped at the
 * pocket's bottom lip so the pocket "eats" it — nothing fades. The pocket beats
 * once per gulp.
 *
 * Presentational + self-contained: it reads the reward set the checkout built
 * and the shared collect-animation channel, so it behaves identically in the
 * real checkout and the `/_test` mock experience.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCollectAnimation } from "@/app/_components/rewards/collect-animation";
import { collectedFromReward, useCollectedCards } from "@/app/_components/rewards/collected-cards";
import { DonationRewardCard } from "./DonationRewardCard";
import type { RewardCard } from "./reward-model";

type Flight = { card: RewardCard; rect: DOMRect; delay: number; order: number };

/** Horizontal fan distance and inward tilt for cards behind the active card.
 * Each card lives in its own flat stacking layer: unlike a shared 3D cylinder,
 * the planes can overlap visually but can never pass through one another. */
const CARD_SPREAD = 180;
const CARD_TILT = 14;
/** Scale a card shrinks to by the time it *reaches* the pocket. Kept fairly
 *  large so the genie warp is performed on a still-visible card rather than a
 *  speck; the final shrink-into-the-mouth is the genie step itself. */
const SCALE_END = 0.24;
/** The uniform scale the card settles to once it has been gulped in. */
const GULP_SCALE = 0.13;

const SNAP = { type: "spring" as const, stiffness: 240, damping: 28 };
const ENTRANCE = { type: "spring" as const, stiffness: 55, damping: 15, mass: 1 };
const FLIGHT_DURATION = 0.92;
// Keep the original tight stream: the whole stack follows the first card with
// only a small delay. Earlier cards render above later ones, so every gulp is
// still visible while the rest of the stack keeps flying behind it.
const FLIGHT_STAGGER = 0.14;

function easeInOut(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Wait until a DOM clipping change has survived a paint before moving the
 * card through it. Two frames prevent Framer Motion from coalescing the mask
 * change with the first gulp frame on busy multi-card sequences. */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

/** Depth cues for a card `offset` slots from the front of the carousel. */
function depthFor(offset: number) {
  const dist = Math.abs(offset);
  return {
    scale: dist === 0 ? 1 : Math.max(0.7, 1 - dist * 0.13),
    opacity: dist > 2 ? 0 : dist === 0 ? 1 : Math.max(0.35, 1 - dist * 0.28),
    blur: dist === 0 ? 0 : Math.min(dist * 1.7, 5),
    zIndex: 100 - dist,
  };
}

/**
 * One card flying into the pocket. A single persistent element (driven by
 * animation controls) so nothing remounts mid-flight.
 *
 * The card flies up the U-arc, comes back *down* into the pocket from above,
 * and is gulped: it stops with its bottom edge exactly on the pocket lip, the
 * overflow mask is committed and painted, then it descends while a genie warp
 * shrinks it, stretches it tall and tapers its bottom into a narrow neck. The
 * mask cannot be active during travel or it would hide the card down in the
 * deck, so this paint boundary is what makes every card get eaten cleanly.
 * No opacity, no rotation.
 */
function RewardFlight({
  card,
  rect,
  pocket,
  delay,
  order,
  onPulse,
  onDone,
}: {
  card: RewardCard;
  rect: DOMRect;
  pocket: DOMRect;
  delay: number;
  order: number;
  onPulse: () => void;
  onDone: () => void;
}) {
  const controls = useAnimationControls();
  const genie = useAnimationControls();
  const maskRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const startCx = rect.left + rect.width / 2;
    const startCy = rect.top + rect.height / 2;
    const pocketCx = pocket.left + pocket.width / 2;

    const dxEnd = pocketCx - startCx;
    // Finish the travel with the card's bottom edge exactly touching the
    // pocket's lower lip. It must not cross that edge before clipping is live.
    const approachCy = pocket.bottom - rect.height * SCALE_END / 2;
    const dyEnd = approachCy - startCy;
    // Quadratic bezier: apex a little above the menu, hugging the start x on the
    // way up, so it reads as "up, then over-and-down into the pocket".
    const apexDy = pocket.top - 60 - startCy;
    const cx = 2 * (dxEnd * 0.12) - 0.5 * dxEnd;
    const cy = 2 * apexDy - 0.5 * dyEnd;

    const steps = 16;
    const xs: number[] = [];
    const ys: number[] = [];
    const scales: number[] = [];
    const blurs: string[] = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const t = easeInOut(u); // bake ease-in-out into the path samples
      const mt = 1 - t;
      const x = 2 * mt * t * cx + t * t * dxEnd;
      const rawY = 2 * mt * t * cy + t * t * dyEnd;
      const scaleAtU = 1 + (SCALE_END - 1) * u;
      // On the descending half, never let the card's bottom cross the pocket
      // lip before its mask is active. It can still rise visibly from the deck,
      // then settles against the mouth as it finishes shrinking.
      const screenBottom = startCy + rawY + rect.height * scaleAtU / 2;
      const y = u >= 0.5 && screenBottom > pocket.bottom
        ? rawY - (screenBottom - pocket.bottom)
        : rawY;
      xs.push(x);
      ys.push(y);
      scales.push(scaleAtU);
      // `filter: blur()` is applied in the card's local space and then scaled
      // down by the transform, so a fixed px blur all but vanishes as the card
      // shrinks. Divide the desired *on-screen* blur by the current scale so it
      // stays visible. A sin bell means the blur eases in from 0 at the start,
      // peaks through the fast middle, and returns to 0 (crisp) at arrival.
      const screenBlur = 6 * Math.sin(Math.PI * u);
      blurs.push(`blur(${(screenBlur / Math.max(scaleAtU, 0.08)).toFixed(1)}px)`);
    }
    // Arm the mouth before the final quarter of the approach. The card is
    // already above the lip here, so clipping can be painted before it matters.
    const maskStep = Math.ceil(steps * 0.75);

    (async () => {
      if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay * 1000));
      if (cancelled) return;

      await controls.start(
        {
          x: xs.slice(0, maskStep + 1),
          y: ys.slice(0, maskStep + 1),
          scale: scales.slice(0, maskStep + 1),
          filter: blurs.slice(0, maskStep + 1),
        },
        { duration: FLIGHT_DURATION * (maskStep / steps), ease: "linear" },
      );
      if (cancelled) return;

      // Switch from the full-screen travel layer to the pocket-bottom mask
      // imperatively, before the final approach. React state batching could
      // otherwise apply overflow after the gulp has already started.
      const mask = maskRef.current;
      if (!mask) return;
      mask.style.inset = "auto";
      mask.style.left = "0";
      mask.style.top = "0";
      mask.style.width = "100%";
      mask.style.height = `${Math.max(0, pocket.bottom)}px`;
      mask.style.overflow = "hidden";
      mask.style.contain = "paint";
      mask.dataset.phase = "masked";
      // Force layout, then allow one complete paint before the card crosses
      // the lip. This makes the first card as clean as the last one.
      void mask.getBoundingClientRect();
      await afterNextPaint();
      if (cancelled) return;

      await controls.start(
        {
          x: xs.slice(maskStep),
          y: ys.slice(maskStep),
          scale: scales.slice(maskStep),
          filter: blurs.slice(maskStep),
        },
        { duration: FLIGHT_DURATION * ((steps - maskStep) / steps), ease: "linear" },
      );
      if (cancelled) return;

      mask.dataset.phase = "gulp";
      onPulse();
      // Genie gulp: descend into the pocket while shrinking, stretching tall and
      // tapering the *bottom* into a narrow neck that funnels into the mouth.
      // Upright throughout (no tilt); the neck never collapses to nothing.
      const gulpEase: [number, number, number, number] = [0.4, 0, 0.85, 0.5];
      const gulpBlur = `blur(${(3 / GULP_SCALE).toFixed(0)}px)`; // ~3px on-screen
      await Promise.all([
        controls.start(
          { y: dyEnd + rect.height * SCALE_END + 180, scale: GULP_SCALE, filter: gulpBlur },
          { duration: 0.6, ease: gulpEase },
        ),
        genie.start(
          { scaleX: 0.42, scaleY: 2.6, clipPath: "polygon(0% 0%, 100% 0%, 60% 100%, 40% 100%)" },
          { duration: 0.6, ease: gulpEase },
        ),
      ]);
      if (cancelled) return;
      onDone();
    })();

    return () => {
      cancelled = true;
    };
    // Run once per flight; geometry is captured at collect time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    // During travel the wrapper is full-screen and unclipped. At the lip it is
    // synchronously resized into the painted overflow mask before gulp motion.
    <div
      ref={maskRef}
      data-reward-flight-mask
      data-card-id={card.id}
      data-phase="travel"
      className="pointer-events-none"
      style={{ position: "fixed", inset: 0, overflow: "visible", zIndex: 10_000 - order }}
      aria-hidden
    >
      <motion.div
        style={{ position: "absolute", left: rect.left, top: rect.top, width: rect.width }}
        initial={{ x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
        animate={controls}
      >
        {/* Inner layer carries the genie warp so it composes cleanly with the
            outer uniform scale. Anchored at the top so it stretches downward
            into the pocket's mouth, tapering its bottom into a neck. */}
        <motion.div
          style={{ transformOrigin: "center top" }}
          initial={{ scaleX: 1, scaleY: 1, clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
          animate={genie}
        >
          <DonationRewardCard
            lines={card.lines}
            totalUsd={card.totalUsd}
            animateEntrance={false}
            interactive={false}
            overall={card.variant === "total"}
          />
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}

export function RewardDeck({
  cards,
  did,
  persistence = "local",
  cardsHref = "/cards",
}: {
  cards: RewardCard[];
  /** Account DID the collected cards are saved under (null = browser-only guest collection). */
  did: string | null;
  persistence?: "local" | "memory";
  /** Mock experiences can adapt navigation without replacing production UI. */
  cardsHref?: string;
}) {
  const t = useTranslations("cart.checkoutPage.reward");
  const reduceMotion = useReducedMotion();
  const { beginCollect, endCollect, pulse } = useCollectAnimation();
  const { addCards } = useCollectedCards(did, persistence);

  const [remaining, setRemaining] = useState<RewardCard[]>(cards);
  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(reduceMotion === true);
  const [busy, setBusy] = useState(false);
  const [storedDurably, setStoredDurably] = useState(true);
  const [collectingIds, setCollectingIds] = useState<Set<string>>(new Set());
  const [flights, setFlights] = useState<Flight[]>([]);
  const [pocketRect, setPocketRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  const cardEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const completedRef = useRef(0);

  useEffect(() => setMounted(true), []);

  // Never leave the global header in its collecting state if this flow unmounts
  // during an animation or route change.
  useEffect(() => () => endCollect(), [endCollect]);

  // Flip to snappy transitions once the revolving entrance has played.
  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setEntered(true), 1200);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  const clampIndex = useCallback((next: number, length: number) => {
    if (length <= 0) return 0;
    return Math.max(0, Math.min(next, length - 1));
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (busy) return;
      setIndex(clampIndex(next, remaining.length));
    },
    [busy, remaining.length, clampIndex],
  );
  const goPrev = useCallback(() => !busy && setIndex((i) => Math.max(0, i - 1)), [busy]);
  const goNext = useCallback(
    () => !busy && setIndex((i) => Math.min(remaining.length - 1, i + 1)),
    [busy, remaining.length],
  );

  const collectImmediately = useCallback(
    (targets: RewardCard[]) => {
      const ids = new Set(targets.map((card) => card.id));
      const collectedAt = Date.now();
      setStoredDurably(addCards(targets.map((card) => collectedFromReward(card, collectedAt))));
      const next = remaining.filter((card) => !ids.has(card.id));
      setRemaining(next);
      setIndex((current) => clampIndex(current, next.length));
      setCollectingIds(new Set());
      setPocketRect(null);
      setFlights([]);
      setBusy(false);
    },
    [addCards, clampIndex, remaining],
  );

  const finalize = useCallback(() => {
    if (flights.length === 0) return;
    collectImmediately(flights.map((flight) => flight.card));
    endCollect();
  }, [collectImmediately, endCollect, flights]);

  const runCollect = useCallback(
    async (targets: RewardCard[]) => {
      if (busy || targets.length === 0) return;
      setBusy(true);

      // Reduced-motion users get the same result without the cross-screen
      // flight, blur, carousel dissolve, or header heartbeat.
      if (reduceMotion) {
        collectImmediately(targets);
        return;
      }

      // Every clone flies from the front (active, unscaled) card's position so
      // the collect-all stream stays a consistent size.
      const front = remaining[index] ?? targets[0];
      const rect = cardEls.current.get(front.id)?.getBoundingClientRect() ?? null;

      if (!rect) {
        collectImmediately(targets);
        return;
      }

      // Header widens its pocket first; then the cards get vacuumed in. If the
      // header target is unavailable, save immediately rather than stranding
      // the checkout in a permanent busy state.
      const pocket = await beginCollect();
      if (!pocket) {
        endCollect();
        collectImmediately(targets);
        return;
      }

      completedRef.current = 0;
      setPocketRect(pocket);
      setCollectingIds(new Set(targets.map((card) => card.id)));
      setFlights(targets.map((card, i) => ({ card, rect, delay: i * FLIGHT_STAGGER, order: i })));
    },
    [busy, reduceMotion, remaining, index, beginCollect, endCollect, collectImmediately],
  );

  const handleFlightDone = useCallback(() => {
    completedRef.current += 1;
    if (completedRef.current === flights.length) finalize();
  }, [flights.length, finalize]);

  const activeCard = remaining[index] ?? null;
  const multiple = remaining.length > 1;

  if (remaining.length === 0 && flights.length === 0) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
        className="flex flex-col items-center gap-3 py-6 text-center"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <SparklesIcon className="size-6" aria-hidden />
        </span>
        <p className="font-instrument text-2xl italic text-foreground">{t("collectedTitle")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t(storedDurably ? "collectedBody" : "collectedSessionBody")}
        </p>
        <Button asChild variant="outline" className="mt-1 shadow-none">
          <Link href={cardsHref}>{t("viewMyCards")}</Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center">
      {/* Stage — an invisible front card reserves height; the 3D carousel is
          layered over it so cards can swing out to the sides freely. */}
      <div className="relative isolate flex w-full justify-center" style={{ perspective: 1400 }}>
        <div className="invisible" aria-hidden>
          {activeCard ? (
            <DonationRewardCard lines={activeCard.lines} totalUsd={activeCard.totalUsd} animateEntrance={false} interactive={false} overall={activeCard.variant === "total"} />
          ) : null}
        </div>

        <motion.div
          className="absolute inset-0"
          initial={reduceMotion ? false : { scale: 0.82, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={reduceMotion ? { duration: 0 } : ENTRANCE}
          drag={multiple && !busy ? "x" : false}
          dragSnapToOrigin
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          onDragEnd={(_, info) => {
            if (info.offset.x < -50 || info.velocity.x < -400) goNext();
            else if (info.offset.x > 50 || info.velocity.x > 400) goPrev();
          }}
        >
          {remaining.map((card, i) => {
            const offset = i - index;
            const depth = depthFor(offset);
            const hidden = collectingIds.has(card.id);
            const isActive = offset === 0 && !busy;
            return (
              <div
                key={card.id}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{ zIndex: depth.zIndex }}
              >
                <motion.div
                  ref={(el) => {
                    if (el) cardEls.current.set(card.id, el);
                    else cardEls.current.delete(card.id);
                  }}
                  animate={{
                    x: offset * CARD_SPREAD,
                    rotateY: offset * -CARD_TILT,
                    scale: depth.scale,
                    opacity: hidden ? 0 : depth.opacity,
                    filter: `blur(${depth.blur}px)`,
                  }}
                  transition={reduceMotion ? { duration: 0 } : entered ? SNAP : ENTRANCE}
                  className={cn(
                    "pointer-events-auto",
                    !isActive && !busy && "cursor-pointer",
                  )}
                  aria-hidden={!isActive}
                  onClick={() => {
                    if (!isActive && !busy) goTo(i);
                  }}
                >
                  <DonationRewardCard
                    lines={card.lines}
                    totalUsd={card.totalUsd}
                    animateEntrance={false}
                    interactive={isActive}
                    overall={card.variant === "total"}
                  />
                </motion.div>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* Flick controls */}
      {multiple ? (
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0 || busy}
            aria-label={t("prevCard")}
            className="grid size-8 place-items-center rounded-full border border-border-soft text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeftIcon className="size-4" aria-hidden />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label={t("deckHint")}>
            {remaining.map((card, i) => (
              <button
                key={card.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={t("cardPosition", { current: i + 1, total: remaining.length })}
                onClick={() => goTo(i)}
                disabled={busy}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/50",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={index === remaining.length - 1 || busy}
            aria-label={t("nextCard")}
            className="grid size-8 place-items-center rounded-full border border-border-soft text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronRightIcon className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Collect actions */}
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <Button type="button" onClick={() => (activeCard ? runCollect([activeCard]) : undefined)} disabled={busy || !activeCard} className="shadow-none">
          <SparklesIcon className="size-4" aria-hidden />
          {t("collect")}
        </Button>
        {multiple ? (
          <Button type="button" variant="outline" onClick={() => runCollect(remaining)} disabled={busy} className="shadow-none">
            {t("collectAll", { count: remaining.length })}
          </Button>
        ) : null}
      </div>

      {/* Flying clones — vacuumed into the header pocket. */}
      {mounted && pocketRect
        ? flights.map((flight) => (
            <RewardFlight
              key={flight.card.id}
              card={flight.card}
              rect={flight.rect}
              pocket={pocketRect}
              delay={flight.delay}
              order={flight.order}
              onPulse={pulse}
              onDone={handleFlightDone}
            />
          ))
        : null}
    </div>
  );
}
