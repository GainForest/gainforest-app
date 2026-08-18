// Lightweight client-side error reporter. Errors caught by boundaries or the
// window listeners are POSTed to /api/client-errors so production crashes are
// visible in server logs instead of dying silently in the user's browser.
//
// Deliberately dependency-free and defensive: reporting must never throw or
// loop (a reporter that crashes while reporting a crash makes things worse).

const MAX_REPORTS_PER_PAGE = 10;
const MAX_FIELD_LENGTH = 4000;

let reportsSent = 0;
const seenSignatures = new Set<string>();

type ClientErrorReport = {
  context: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
};

function truncate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value;
}

export function reportClientError(
  error: unknown,
  context: string,
  componentStack?: string | null,
): void {
  try {
    if (typeof window === "undefined") return;
    if (reportsSent >= MAX_REPORTS_PER_PAGE) return;

    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

    // Dedupe identical errors within a page lifetime (render loops, retries).
    const signature = `${context}:${message}`;
    if (seenSignatures.has(signature)) return;
    seenSignatures.add(signature);
    reportsSent += 1;

    const report: ClientErrorReport = {
      context,
      message: truncate(message) ?? "(no message)",
      stack: truncate(error instanceof Error ? error.stack : undefined),
      componentStack: truncate(componentStack ?? undefined),
      url: truncate(window.location.href),
    };

    const body = JSON.stringify(report);
    if (navigator.sendBeacon?.("/api/client-errors", new Blob([body], { type: "application/json" }))) {
      return;
    }
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Reporting is best-effort only.
    });
  } catch {
    // Never let the reporter itself throw.
  }
}
