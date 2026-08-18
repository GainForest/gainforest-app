"use client";

/**
 * Tiny client-side store for the signed-in viewer's identity, resolved once from
 * /api/session and shared module-wide (like the account switcher). This lets
 * deep, prop-less components — the follow button, account hover cards — know who
 * the viewer is without every parent threading a sessionDid down to them.
 *
 * The fetch runs at most once per page load and is deduped across consumers; the
 * snapshot is a stable reference so useSyncExternalStore never loops.
 */

import { useEffect, useSyncExternalStore } from "react";

type ViewerStatus = "idle" | "loading" | "ready";
export type ViewerState = { status: ViewerStatus; sessionDid: string | null };

const SERVER_STATE: ViewerState = { status: "idle", sessionDid: null };

let state: ViewerState = SERVER_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ViewerState {
  return state;
}

function getServerSnapshot(): ViewerState {
  return SERVER_STATE;
}

async function load(): Promise<void> {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    const data = response.ok
      ? ((await response.json()) as { session?: { isLoggedIn?: boolean; did?: string } })
      : null;
    const did =
      data?.session?.isLoggedIn && typeof data.session.did === "string" ? data.session.did : null;
    state = { status: "ready", sessionDid: did };
  } catch {
    state = { status: "ready", sessionDid: null };
  }
  emit();
}

/** Resolve the viewer session once (deduped). Safe no-op on the server. */
function ensureViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (state.status === "ready") return Promise.resolve();
  if (inflight) return inflight;
  state = { ...state, status: "loading" };
  emit();
  inflight = load().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The current viewer state ("idle" until mounted, then "loading"/"ready"). */
export function useViewer(): ViewerState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void ensureViewer();
  }, []);
  return snapshot;
}
