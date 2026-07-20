"use client";

// Shared state for the article's live experiments. The key grown in
// "Grow a key" (KeyForge) flows into the address derivation (AddressForge),
// so the reader watches their own browser-made key become part of a real
// wallet address further down the page.

import { createContext, useContext, useState } from "react";

export type LabKey = {
  /** 32-byte hex, P-256 public key X coordinate — the contract's slot1. */
  x: `0x${string}`;
  /** 32-byte hex, P-256 public key Y coordinate — the contract's slot2. */
  y: `0x${string}`;
};

type WalletLabState = {
  labKey: LabKey | null;
  setLabKey: (key: LabKey) => void;
};

const WalletLabContext = createContext<WalletLabState>({
  labKey: null,
  setLabKey: () => undefined,
});

export function WalletLabProvider({ children }: { children: React.ReactNode }) {
  const [labKey, setLabKey] = useState<LabKey | null>(null);
  return <WalletLabContext.Provider value={{ labKey, setLabKey }}>{children}</WalletLabContext.Provider>;
}

export function useWalletLab(): WalletLabState {
  return useContext(WalletLabContext);
}

/** Uncompressed P-256 point (0x04 || x || y) → the two bytes32 slots. */
export function rawPointToSlots(raw: ArrayBuffer): LabKey | null {
  const bytes = new Uint8Array(raw);
  if (bytes.length !== 65 || bytes[0] !== 0x04) return null;
  const hex = (part: Uint8Array) => `0x${Array.from(part, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;
  return { x: hex(bytes.slice(1, 33)), y: hex(bytes.slice(33, 65)) };
}

export function truncateHex(hex: string, chars = 6): string {
  if (hex.length <= 2 + chars * 2) return hex;
  return `${hex.slice(0, 2 + chars)}…${hex.slice(-chars)}`;
}
