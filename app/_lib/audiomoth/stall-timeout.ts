/**
 * Watchdogs for the two operations in the AudioMoth uploader that can hang
 * forever without ever failing.
 *
 * A browser upload that loses its connection mid-flight does not always
 * error: a half-open socket leaves the request pending with no `load`, no
 * `error` and no further `progress`, so retry logic never gets a chance to
 * run. Reading a file off an SD card can block the same way when the card
 * sleeps or a sector is bad.
 *
 * Both need an external clock to notice nothing is happening.
 */

/** No upload progress for this long means the transfer is wedged, not slow. */
export const UPLOAD_STALL_TIMEOUT_MS = 90_000;

/** A header read slower than this is treated as an unreadable file. */
export const FILE_READ_TIMEOUT_MS = 30_000;

export type StallTimer = {
  /** Signal that progress happened — restarts the countdown. */
  bump: () => void;
  /** Stop watching (the operation finished or was cancelled). */
  stop: () => void;
};

/**
 * Calls `onStall` once when `bump()` has not been called for `timeoutMs`.
 * Starts armed, so an operation that never reports any progress at all is
 * caught too. `stop()` is idempotent and prevents any later firing.
 */
export function createStallTimer(timeoutMs: number, onStall: () => void): StallTimer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const arm = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) onStall();
    }, timeoutMs);
  };

  arm();

  return {
    bump: arm,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * The result of `task`, or `fallback` when it rejects or has not settled
 * within `timeoutMs`. Never throws — a single unreadable file must not be
 * able to stop a scan of thousands of them.
 */
export async function withReadTimeout<T>(task: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([task.catch(() => fallback), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
