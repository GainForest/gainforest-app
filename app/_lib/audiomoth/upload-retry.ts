/** Retry policy for direct AudioMoth recording uploads. */

export const AUDIO_UPLOAD_RETRY_DELAYS_MS = [1_000, 2_500, 5_000] as const;
export const AUDIO_UPLOAD_MAX_ATTEMPTS = AUDIO_UPLOAD_RETRY_DELAYS_MS.length + 1;

const RETRYABLE_STORAGE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStorageError(error: unknown): boolean {
  if (!(error instanceof Error) || error.message === "aborted") return false;
  if (error.message === "storage_network") return true;
  const match = error.message.match(/^storage_(\d{3})$/);
  return match ? RETRYABLE_STORAGE_STATUSES.has(Number(match[1])) : false;
}

/**
 * A browser fetch() that never reached the server — the user is offline or
 * the connection dropped. Chrome says "Failed to fetch", Safari "Load
 * failed", Firefox "NetworkError when attempting to fetch a resource.";
 * all are TypeErrors.
 */
export function isNetworkFetchError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "TypeError" &&
    /fetch|network|load failed|connection/i.test(error.message)
  );
}

/** HTTP status from a `storage_<status>` PUT failure, or null. */
export function storageStatusFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/^storage_(\d{3})$/);
  return match ? Number(match[1]) : null;
}

export function isUploadAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.message === "aborted") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function abortError(): DOMException {
  return new DOMException("The upload was cancelled.", "AbortError");
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, delayMs);

    function finish() {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }

    function cancel() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    }

    signal?.addEventListener("abort", cancel, { once: true });
  });
}

type RetryNotice = {
  error: unknown;
  failedAttempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
};

export async function withUploadRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    shouldRetry: (error: unknown) => boolean;
    onRetry?: (notice: RetryNotice) => void;
    signal?: AbortSignal;
    delaysMs?: readonly number[];
    wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<T> {
  const delays = options.delaysMs ?? AUDIO_UPLOAD_RETRY_DELAYS_MS;
  const waitForRetry = options.wait ?? wait;
  const maxAttempts = delays.length + 1;

  for (let attempt = 1; ; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !options.shouldRetry(error)) throw error;
      const delayMs = delays[attempt - 1]!;
      options.onRetry?.({
        error,
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
      });
      await waitForRetry(delayMs, options.signal);
    }
  }
}
