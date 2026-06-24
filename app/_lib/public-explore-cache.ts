import { cachedAsync } from "./async-cache";

export const PUBLIC_EXPLORE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PUBLIC_EXPLORE_REVALIDATE_SECONDS = 24 * 60 * 60;

/**
 * One switch for the heavy public Explore surfaces. Set this to false to undo
 * the 24h client-side data cache without touching each page/fetcher.
 */
export const PUBLIC_EXPLORE_CACHE_ENABLED = true;

export function publicExploreCache<T>(
  scope: string,
  params: unknown,
  loader: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!PUBLIC_EXPLORE_CACHE_ENABLED) return cachedAsync(`public-explore-disabled:${scope}:${Date.now()}:${Math.random()}`, 0, loader, signal);
  return cachedAsync(publicExploreCacheKey(scope, params), PUBLIC_EXPLORE_CACHE_TTL_MS, loader, signal);
}

export function publicExploreCacheKey(scope: string, params: unknown): string {
  return `public-explore:v1:${scope}:${stableStringify(params)}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === undefined) return "__undefined__";
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, item]) => [normalize(key), normalize(item)])
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map(normalize).sort((a, b) => String(a).localeCompare(String(b)));
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, normalize(record[key])]),
  );
}
