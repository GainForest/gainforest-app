"use client";

/**
 * A donor's collected reward cards — the collectibles they "vacuumed" into
 * the header from the post-checkout reward deck. Backed by localStorage and
 * scoped per account DID; signed-out donors use a browser-only guest scope so
 * the cards they just collected are still available from `/cards`.
 * `/_test` experiences use `persistence: "memory"` so previews never touch a
 * real visitor's saved cards.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { tierForAmount, type RewardCard, type RewardLine, type TierKey } from "@/app/checkout/_components/reward-model";

export type CollectedCard = {
  /** Unique per collected instance (stable id + collection timestamp). */
  id: string;
  variant: "project" | "total";
  title: string;
  orgName: string;
  totalUsd: number;
  image?: string | null;
  tier: TierKey;
  lines: RewardLine[];
  collectedAt: number;
};

const STORAGE_PREFIX = "gainforest.reward-cards.v1:";
const GUEST_SCOPE = "guest";
const CARDS_UPDATED_EVENT = "gainforest:reward-cards-updated";
const TIER_KEYS = new Set<TierKey>(["seedling", "sapling", "grove", "canopy", "oldGrowth"]);
// Keeps cards available across client-side navigation when localStorage is
// blocked or full. A reload cannot preserve this fallback, so callers receive
// the write result and can describe that limitation accurately.
const memoryFallback = new Map<string, CollectedCard[]>();
const volatileKeys = new Set<string>();

export function collectedCardsStorageKey(did: string | null): string {
  return `${STORAGE_PREFIX}${did ?? GUEST_SCOPE}`;
}

function isRewardLine(value: unknown): value is RewardLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<RewardLine>;
  return (
    (line.kind === "donation" || line.kind === "tip") &&
    typeof line.title === "string" &&
    typeof line.orgName === "string" &&
    typeof line.amountUsd === "number" &&
    Number.isFinite(line.amountUsd) &&
    (line.image === undefined || line.image === null || typeof line.image === "string")
  );
}

function isCollectedCard(value: unknown): value is CollectedCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<CollectedCard>;
  return (
    typeof card.id === "string" &&
    (card.variant === "project" || card.variant === "total") &&
    typeof card.title === "string" &&
    typeof card.orgName === "string" &&
    typeof card.totalUsd === "number" &&
    Number.isFinite(card.totalUsd) &&
    card.totalUsd >= 0 &&
    (card.image === undefined || card.image === null || typeof card.image === "string") &&
    typeof card.tier === "string" &&
    TIER_KEYS.has(card.tier as TierKey) &&
    Array.isArray(card.lines) &&
    card.lines.length > 0 &&
    card.lines.every(isRewardLine) &&
    typeof card.collectedAt === "number" &&
    Number.isFinite(card.collectedAt)
  );
}

/** Safely parse the browser-owned cache; malformed entries never reach UI. */
export function parseStoredCards(raw: string | null): CollectedCard[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCollectedCard);
  } catch {
    return [];
  }
}

/** Derive a persisted collected card from a freshly-earned reward card. */
export function collectedFromReward(card: RewardCard, collectedAt: number): CollectedCard {
  const featured = card.lines.find((line) => line.kind === "donation") ?? card.lines[0];
  return {
    id: `${card.id}-${collectedAt}`,
    variant: card.variant,
    title: featured?.title ?? "",
    orgName: featured?.orgName ?? "",
    totalUsd: card.totalUsd,
    image: featured?.image ?? null,
    tier: tierForAmount(card.totalUsd).key,
    lines: card.lines,
    collectedAt,
  };
}

/** Rehydrate a collected card back into the deck/gallery reward shape. */
export function rewardFromCollected(card: CollectedCard): RewardCard {
  return { id: card.id, variant: card.variant, lines: card.lines, totalUsd: card.totalUsd };
}

export function readCollectedCards(key: string): CollectedCard[] {
  // Once a write fails, the module copy is newer than the stale durable value.
  // Keep preferring it until a later write of the complete collection succeeds.
  if (volatileKeys.has(key)) return memoryFallback.get(key) ?? [];
  try {
    const raw = window.localStorage.getItem(key);
    const cards = raw === null ? memoryFallback.get(key) ?? [] : parseStoredCards(raw);
    memoryFallback.set(key, cards);
    return cards;
  } catch {
    return memoryFallback.get(key) ?? [];
  }
}

/** Returns whether the cards were durably written to browser storage. */
export function writeCollectedCards(key: string, cards: CollectedCard[]): boolean {
  memoryFallback.set(key, cards);
  let stored = false;
  try {
    window.localStorage.setItem(key, JSON.stringify(cards));
    volatileKeys.delete(key);
    stored = true;
  } catch {
    // Private windows and full quotas can block storage. The module-level copy
    // still survives client-side navigation during this browser session.
    volatileKeys.add(key);
  }
  window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT, { detail: { key } }));
  return stored;
}

export function useCollectedCards(
  did: string | null,
  persistence: "local" | "memory" = "local",
) {
  const persistent = persistence === "local";
  const key = collectedCardsStorageKey(did);
  const [cards, setCards] = useState<CollectedCard[]>([]);
  const cardsRef = useRef<CollectedCard[]>([]);
  const [hydrated, setHydrated] = useState(!persistent);

  const replaceCards = useCallback((next: CollectedCard[]) => {
    cardsRef.current = next;
    setCards(next);
  }, []);

  useEffect(() => {
    if (!persistent) {
      setHydrated(true);
      return;
    }

    setHydrated(false);
    const reload = () => replaceCards(readCollectedCards(key));
    reload();
    setHydrated(true);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) reload();
    };
    const handleCardsUpdated = (event: Event) => {
      if ((event as CustomEvent<{ key?: string }>).detail?.key === key) reload();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CARDS_UPDATED_EVENT, handleCardsUpdated);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CARDS_UPDATED_EVENT, handleCardsUpdated);
    };
  }, [key, persistent, replaceCards]);

  const addCards = useCallback(
    (incoming: CollectedCard[]) => {
      if (incoming.length === 0) return true;
      const current = persistent ? readCollectedCards(key) : cardsRef.current;
      const next = [...incoming, ...current];
      replaceCards(next);
      return persistent ? writeCollectedCards(key, next) : true;
    },
    [key, persistent, replaceCards],
  );

  const clear = useCallback(() => {
    replaceCards([]);
    return persistent ? writeCollectedCards(key, []) : true;
  }, [key, persistent, replaceCards]);

  return { cards, hydrated, addCards, clear };
}
