"use client";

import { useSyncExternalStore } from "react";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  getAnalyticsConsent,
  type AnalyticsConsent,
} from "./consent";

function subscribeToAnalyticsConsent(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getServerAnalyticsConsent(): AnalyticsConsent | null {
  return null;
}

export function useAnalyticsConsent(): AnalyticsConsent | null {
  return useSyncExternalStore(
    subscribeToAnalyticsConsent,
    getAnalyticsConsent,
    getServerAnalyticsConsent,
  );
}
