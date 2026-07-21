"use client";

/**
 * Coordinates the "collect" animation that spans two otherwise-independent
 * parts of the chrome: the reward deck (in the page body) and the app header.
 *
 * When the donor collects their cards, the header fades its right-side widgets
 * (search, cart, notifications) and morphs the account button into a wide
 * rounded "pocket". The deck then flies the cards into that pocket. This
 * provider is the shared channel: the header registers the pocket element and
 * reads the phase; the deck starts/ends the sequence and reads the pocket's
 * live screen position as the vacuum target.
 *
 * A no-op default lets either side render safely without the provider (e.g.
 * on routes that hide the header), in which case the deck falls back to the
 * top-right corner.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type CollectPhase = "idle" | "collecting";

/** Header morph settle time (ms). The deck waits this long — until the pocket's
 *  spring has mostly settled at full width — before flying cards in. */
export const COLLECT_MORPH_MS = 700;

type CollectAnimationContextValue = {
  phase: CollectPhase;
  /** Header publishes the morph target (the account pocket) here. */
  registerTarget: (element: HTMLElement | null) => void;
  /** Live screen rect of the pocket, or null when no header is mounted. */
  getTargetRect: () => DOMRect | null;
  /** Start collecting; resolves with the pocket rect once the morph settles. */
  beginCollect: () => Promise<DOMRect | null>;
  /** End collecting; the header morphs back to normal. */
  endCollect: () => void;
  /** Monotonic counter; bumped each time a card is gulped so the pocket beats. */
  pulseKey: number;
  /** Fire a single "gulp" heartbeat on the pocket. */
  pulse: () => void;
};

const noop: CollectAnimationContextValue = {
  phase: "idle",
  registerTarget: () => {},
  getTargetRect: () => null,
  beginCollect: async () => null,
  endCollect: () => {},
  pulseKey: 0,
  pulse: () => {},
};

const CollectAnimationContext = createContext<CollectAnimationContextValue>(noop);

export function CollectAnimationProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<CollectPhase>("idle");
  const [pulseKey, setPulseKey] = useState(0);
  const targetRef = useRef<HTMLElement | null>(null);

  const pulse = useCallback(() => setPulseKey((key) => key + 1), []);

  const registerTarget = useCallback((element: HTMLElement | null) => {
    targetRef.current = element;
  }, []);

  const getTargetRect = useCallback(
    () => targetRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  const beginCollect = useCallback(async () => {
    setPhase("collecting");
    // Let the header widen its pocket before we measure where to fly cards.
    await new Promise((resolve) => window.setTimeout(resolve, COLLECT_MORPH_MS));
    return targetRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const endCollect = useCallback(() => {
    setPhase("idle");
  }, []);

  const value = useMemo<CollectAnimationContextValue>(
    () => ({ phase, registerTarget, getTargetRect, beginCollect, endCollect, pulseKey, pulse }),
    [phase, registerTarget, getTargetRect, beginCollect, endCollect, pulseKey, pulse],
  );

  return <CollectAnimationContext.Provider value={value}>{children}</CollectAnimationContext.Provider>;
}

export function useCollectAnimation(): CollectAnimationContextValue {
  return useContext(CollectAnimationContext);
}
