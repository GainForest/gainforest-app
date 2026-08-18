"use client";

import type { AccountSummary } from "./indexer";

/**
 * Client-side, session-cached fetcher for the comprehensive account summary
 * shown in the feed hover card. Mirrors the batching/dedup spirit of
 * did-profile.ts but keyed per-DID and lazy: a summary is only fetched the
 * first time a card for that account is actually opened.
 */

const cache = new Map<string, AccountSummary>();
const inflight = new Map<string, Promise<AccountSummary | null>>();

export function getCachedAccountSummary(did: string): AccountSummary | undefined {
  return cache.get(did);
}

export async function resolveAccountSummary(
  did: string,
  signal?: AbortSignal,
): Promise<AccountSummary | null> {
  if (!did || !did.startsWith("did:")) return null;

  const cached = cache.get(did);
  if (cached) return cached;

  const existing = inflight.get(did);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/account/summary?did=${encodeURIComponent(did)}`, {
        headers: { accept: "application/json" },
        signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AccountSummary;
      cache.set(did, data);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(did);
    }
  })();

  inflight.set(did, promise);
  return promise;
}
