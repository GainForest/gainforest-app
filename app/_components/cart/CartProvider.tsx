"use client";

/**
 * Donation cart — a localStorage-backed basket of projects and accounts the
 * visitor wants to support. Items are edited on /cart and paid together on
 * /checkout with an optional GainForest tip.
 *
 * The tip percentage chosen at checkout is persisted alongside the items so
 * an abandoned checkout keeps the visitor's choice.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type CartItem = {
  /** Project donation or direct support for a user/organization account. */
  kind: "project" | "account";
  /** Account DID that receives the donation. */
  orgDid: string;
  /** Project record key, or ACCOUNT_SUPPORT_RKEY for direct account support. */
  rkey: string;
  title: string;
  orgName: string;
  image: string | null;
  amountUsd: number;
  minUsd: number | null;
  maxUsd: number | null;
};

const DEFAULT_TIP_PERCENT = 10;
export const MAX_TIP_PERCENT = 25;
/** Stable local cart key for a donation made directly to an account wallet. */
export const ACCOUNT_SUPPORT_RKEY = "$account";

const STORAGE_KEY = "gainforest.donation-cart.v1";

type StoredCart = {
  items: CartItem[];
  tipPercent: number;
};

export function cartItemKey(item: Pick<CartItem, "orgDid" | "rkey">): string {
  return `${item.orgDid}/${item.rkey}`;
}

function sanitizeAmount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  // USDC has 6 decimals but donations are entered in cents.
  return Math.round(parsed * 100) / 100;
}

function sanitizeTipPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return DEFAULT_TIP_PERCENT;
  return Math.min(MAX_TIP_PERCENT, Math.max(0, Math.round(parsed)));
}

function parseStoredCart(raw: string | null): StoredCart {
  const empty: StoredCart = { items: [], tipPercent: DEFAULT_TIP_PERCENT };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCart> | null;
    if (!parsed || !Array.isArray(parsed.items)) return empty;
    const items: CartItem[] = [];
    for (const candidate of parsed.items) {
      if (!candidate || typeof candidate !== "object") continue;
      const item = candidate as Partial<CartItem>;
      const amountUsd = sanitizeAmount(item.amountUsd);
      if (
        typeof item.orgDid !== "string" || !item.orgDid ||
        typeof item.rkey !== "string" || !item.rkey ||
        typeof item.title !== "string" ||
        typeof item.orgName !== "string" ||
        amountUsd === null
      ) {
        continue;
      }
      items.push({
        kind: item.kind === "account" ? "account" : "project",
        orgDid: item.orgDid,
        rkey: item.rkey,
        title: item.title,
        orgName: item.orgName,
        image: typeof item.image === "string" ? item.image : null,
        amountUsd,
        minUsd: typeof item.minUsd === "number" && Number.isFinite(item.minUsd) ? item.minUsd : null,
        maxUsd: typeof item.maxUsd === "number" && Number.isFinite(item.maxUsd) ? item.maxUsd : null,
      });
    }
    return { items, tipPercent: sanitizeTipPercent(parsed.tipPercent) };
  } catch {
    return empty;
  }
}

type CartContextValue = {
  /** False until the first localStorage read, so SSR/first paint match. */
  hydrated: boolean;
  items: CartItem[];
  count: number;
  /** Sum of all line amounts in USD. */
  subtotalUsd: number;
  tipPercent: number;
  addItem: (item: CartItem) => void;
  removeItem: (orgDid: string, rkey: string) => void;
  setAmount: (orgDid: string, rkey: string, amountUsd: number) => void;
  setTipPercent: (percent: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
  persistence = "local",
}: {
  children: React.ReactNode;
  /** Memory mode is reserved for side-effect-free UI experiences such as /_test. */
  persistence?: "local" | "memory";
}) {
  const persistent = persistence === "local";
  const [hydrated, setHydrated] = useState(!persistent);
  const [items, setItems] = useState<CartItem[]>([]);
  const [tipPercent, setTipPercentState] = useState(DEFAULT_TIP_PERCENT);
  // Guard so the storage-event listener doesn't loop on our own writes.
  const lastWriteRef = useRef<string | null>(null);

  useEffect(() => {
    if (!persistent) return;
    try {
      const stored = parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
      setItems(stored.items);
      setTipPercentState(stored.tipPercent);
    } catch {
      // Private windows can block storage — in-memory cart still works.
    }
    setHydrated(true);
  }, [persistent]);

  useEffect(() => {
    if (!persistent || !hydrated) return;
    const serialized = JSON.stringify({ items, tipPercent } satisfies StoredCart);
    lastWriteRef.current = serialized;
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Ignore storage write failures.
    }
  }, [persistent, hydrated, items, tipPercent]);

  // Keep multiple tabs in sync. Memory-backed mock experiences must never
  // observe or mutate the visitor's real donation cart.
  useEffect(() => {
    if (!persistent) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue === lastWriteRef.current) return;
      const stored = parseStoredCart(event.newValue);
      setItems(stored.items);
      setTipPercentState(stored.tipPercent);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [persistent]);

  const addItem = useCallback((item: CartItem) => {
    const amountUsd = sanitizeAmount(item.amountUsd);
    if (amountUsd === null) return;
    setItems((current) => {
      const key = cartItemKey(item);
      const next = current.filter((existing) => cartItemKey(existing) !== key);
      next.push({ ...item, amountUsd });
      return next;
    });
  }, []);

  const removeItem = useCallback((orgDid: string, rkey: string) => {
    setItems((current) => current.filter((item) => item.orgDid !== orgDid || item.rkey !== rkey));
  }, []);

  const setAmount = useCallback((orgDid: string, rkey: string, amountUsd: number) => {
    setItems((current) =>
      current.map((item) =>
        item.orgDid === orgDid && item.rkey === rkey ? { ...item, amountUsd } : item,
      ),
    );
  }, []);

  const setTipPercent = useCallback((percent: number) => {
    setTipPercentState(sanitizeTipPercent(percent));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const subtotalUsd = items.reduce(
      (total, item) => total + (Number.isFinite(item.amountUsd) ? item.amountUsd : 0),
      0,
    );
    return {
      hydrated,
      items,
      count: items.length,
      subtotalUsd: Math.round(subtotalUsd * 100) / 100,
      tipPercent,
      addItem,
      removeItem,
      setAmount,
      setTipPercent,
      clear,
    };
  }, [hydrated, items, tipPercent, addItem, removeItem, setAmount, setTipPercent, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}

/** Tip amount in USD for the given subtotal, rounded to cents. */
export function tipAmountUsd(subtotalUsd: number, tipPercent: number): number {
  return Math.round(subtotalUsd * tipPercent) / 100;
}
