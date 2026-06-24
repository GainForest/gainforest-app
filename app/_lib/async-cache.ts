type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

function abortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}

export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Cache an async value while still letting each caller stop waiting via its own
 * AbortSignal. Keep `loader` independent from caller-specific abort signals;
 * a cached promise is shared, so wiring one caller's signal into the loader can
 * cancel work that other current callers are still awaiting.
 */
export function cachedAsync<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return withAbort(cached.promise, signal);

  const entry: CacheEntry<T> = {
    expiresAt: now + ttlMs,
    promise: loader(),
  };
  entry.promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  cache.set(key, entry);
  return withAbort(entry.promise, signal);
}
