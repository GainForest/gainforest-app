const ANALYTICS_CONSENT_STORAGE_KEY = "bumicerts_contentsquare_consent";
export const ANALYTICS_CONSENT_CHANGED_EVENT = "bumicerts:analytics-consent-changed";

export type AnalyticsConsent = "granted" | "denied";

let inMemoryAnalyticsConsent: AnalyticsConsent | null = null;

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (value === "granted" || value === "denied") {
      inMemoryAnalyticsConsent = value;
      return value;
    }
  } catch {
    // Storage access can be blocked; fall back to in-memory state.
  }

  return inMemoryAnalyticsConsent;
}

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return getAnalyticsConsent() === "granted";
}

export function setAnalyticsConsent(value: AnalyticsConsent): void {
  if (typeof window === "undefined") return;

  inMemoryAnalyticsConsent = value;

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, value);
  } catch {
    // Best-effort only.
  }

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsent>(ANALYTICS_CONSENT_CHANGED_EVENT, {
      detail: value,
    }),
  );
}
