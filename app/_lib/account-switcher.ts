"use client";

// Shared, cached client store for the account switcher used by both the header
// user menu and the manage-sidebar context switcher.
//
// Why this exists: the menu used to fetch /api/cgs/groups (plus an N+1 of
// /api/account/card lookups) every time it opened, with no shared cache. This
// store fetches once per session and keeps the result in module memory + a
// localStorage mirror, so the switcher paints instantly and only revalidates
// in the background (stale-while-revalidate). In-flight requests are deduped so
// the two consumers never double-fetch.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ACTIVE_MANAGE_CONTEXT_KEY, accountIdentifierFromPath } from "@/lib/links";
import type { CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";

export type AccountCard = { displayName: string | null; avatarUrl: string | null; handle: string | null };
export type SwitcherGroup = CgsGroupMembership & AccountCard;
export type AccountListStatus = "idle" | "loading" | "ready" | "error";

export type AccountListState = {
  status: AccountListStatus;
  sessionDid: string | null;
  personal: AccountCard | null;
  groups: SwitcherGroup[];
  error: string | null;
  fetchedAt: number;
};

export type ActiveAccountContext =
  | { type: "personal"; did: string; selectedAt?: string }
  | { type: "group"; did: string; identifier?: string; role?: CgsGroupMembership["role"]; selectedAt?: string };

const CACHE_KEY = "gainforest-account-switcher-cache";
const ACTIVE_CONTEXT_EVENT = "gainforest-active-account-context";
const TTL_MS = 5 * 60 * 1000;
const EMPTY_GROUP_RECHECK_MS = 30 * 1000;

const SERVER_STATE: AccountListState = {
  status: "idle",
  sessionDid: null,
  personal: null,
  groups: [],
  error: null,
  fetchedAt: 0,
};

let state: AccountListState = SERVER_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let inflightSessionDid: string | null = null;
const emptyGroupRefreshCounts = new Map<string, number>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<AccountListState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AccountListState {
  return state;
}

export function getAccountListSnapshot(): AccountListState {
  return state;
}

function getServerSnapshot(): AccountListState {
  return SERVER_STATE;
}

function readCache(sessionDid: string): AccountListState | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountListState>;
    if (parsed?.sessionDid !== sessionDid) return null;
    return {
      status: "ready",
      sessionDid,
      personal: parsed.personal ?? null,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      error: null,
      fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeCache() {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        sessionDid: state.sessionDid,
        personal: state.personal,
        groups: state.groups,
        fetchedAt: state.fetchedAt,
      }),
    );
  } catch {
    // Storage may be blocked (private windows); in-memory cache still works.
  }
}

export function switcherGroupIdentifier(group: SwitcherGroup): string {
  return group.handle?.trim() || group.groupDid;
}

export function findSwitcherGroupByIdentifier(groups: SwitcherGroup[], identifier: string): SwitcherGroup | null {
  const normalized = identifier.trim();
  if (!normalized) return null;
  const normalizedLower = normalized.toLowerCase();
  return groups.find((group) => {
    if (group.groupDid === normalized) return true;
    return Boolean(group.handle && group.handle.toLowerCase() === normalizedLower);
  }) ?? null;
}

async function hydrateGroup(group: CgsGroupMembership): Promise<SwitcherGroup> {
  if (group.displayName || group.avatarUrl || group.handle) {
    return {
      ...group,
      displayName: group.displayName ?? null,
      avatarUrl: group.avatarUrl ?? null,
      handle: group.handle ?? null,
    };
  }
  const response = await fetch(`/api/account/card?did=${encodeURIComponent(group.groupDid)}`).catch(() => null);
  const card = response?.ok ? ((await response.json()) as AccountCard) : { displayName: null, avatarUrl: null, handle: null };
  return { ...group, displayName: card.displayName, avatarUrl: card.avatarUrl, handle: card.handle ?? null };
}

function hasAccountCardData(card: AccountCard | null): boolean {
  return Boolean(card?.displayName?.trim() || card?.avatarUrl?.trim() || card?.handle?.trim());
}

async function loadAccounts(sessionDid: string): Promise<void> {
  const hadData = state.status === "ready" && (state.groups.length > 0 || state.personal != null);
  setState({ status: hadData ? "ready" : "loading", error: null });

  try {
    const [personalResponse, groupResponse] = await Promise.all([
      fetch(`/api/account/card?did=${encodeURIComponent(sessionDid)}`).catch(() => null),
      fetch("/api/cgs/groups", { cache: "no-store" }).catch(() => null),
    ]);

    if (state.sessionDid !== sessionDid) return;

    const fetchedPersonal = personalResponse?.ok ? ((await personalResponse.json()) as AccountCard) : null;
    const personal = hasAccountCardData(fetchedPersonal) || !hasAccountCardData(state.personal) ? fetchedPersonal : state.personal;

    if (!groupResponse?.ok) {
      throw new Error("Could not load organizations.");
    }

    const payload = (await groupResponse.json().catch(() => ({}))) as { groups?: CgsGroupMembership[] };
    if (!Array.isArray(payload.groups)) {
      throw new Error("Could not load organizations.");
    }

    const hydratedGroups = await Promise.all(payload.groups.map(hydrateGroup));
    let groups = hydratedGroups;
    let fetchedAt = Date.now();

    // CGS membership fetches can occasionally come back as an empty success
    // after the app has been idle (usually while auth/session state is being
    // refreshed). Do not let one suspicious empty response erase a known-good
    // account list in memory/localStorage; keep stale data briefly and require a
    // second empty response before accepting that the user truly has no orgs.
    if (hydratedGroups.length > 0) {
      emptyGroupRefreshCounts.delete(sessionDid);
    } else if (state.groups.length > 0) {
      const emptyCount = (emptyGroupRefreshCounts.get(sessionDid) ?? 0) + 1;
      emptyGroupRefreshCounts.set(sessionDid, emptyCount);
      if (emptyCount < 2) {
        groups = state.groups;
        fetchedAt = Date.now() - TTL_MS + EMPTY_GROUP_RECHECK_MS;
      } else {
        emptyGroupRefreshCounts.delete(sessionDid);
      }
    }

    state = { status: "ready", sessionDid, personal, groups, error: null, fetchedAt };
    emit();
    writeCache();
  } catch {
    if (state.sessionDid !== sessionDid) return;
    setState({ status: state.groups.length || state.personal ? "ready" : "error", error: "Could not load organizations." });
  }
}

/**
 * Ensure the account list is loaded for the given session. Paints from cache
 * immediately, skips the network when data is fresh, and dedupes concurrent
 * callers. Pass `force` to bypass the TTL (e.g. an explicit retry).
 */
export function ensureAccountList(sessionDid: string, options?: { force?: boolean }): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  if (state.sessionDid !== sessionDid) {
    state = readCache(sessionDid) ?? { ...SERVER_STATE, sessionDid };
    emit();
  }

  const fresh = state.status === "ready" && state.groups.length > 0 && Date.now() - state.fetchedAt < TTL_MS;
  if (!options?.force && fresh) return Promise.resolve();
  if (inflight && inflightSessionDid === sessionDid) return inflight;

  inflightSessionDid = sessionDid;
  inflight = loadAccounts(sessionDid).finally(() => {
    inflight = null;
    inflightSessionDid = null;
  });
  return inflight;
}

export type UseAccountListResult = AccountListState & { reload: () => Promise<void> };

export function useAccountList(sessionDid: string | null): UseAccountListResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (sessionDid) {
      void ensureAccountList(sessionDid);
      return;
    }

    state = SERVER_STATE;
    emit();
  }, [sessionDid]);

  return {
    ...snapshot,
    reload: () => (sessionDid ? ensureAccountList(sessionDid, { force: true }) : Promise.resolve()),
  };
}

export function readActiveContext(sessionDid: string): ActiveAccountContext {
  if (typeof window === "undefined") return { type: "personal", did: sessionDid };
  try {
    const raw = window.localStorage.getItem(ACTIVE_MANAGE_CONTEXT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ActiveAccountContext>) : null;
    if (parsed?.type === "group" && typeof parsed.did === "string") {
      return {
        type: "group",
        did: parsed.did,
        identifier: typeof parsed.identifier === "string" ? parsed.identifier : undefined,
        role: parsed.role,
        selectedAt: parsed.selectedAt,
      };
    }
  } catch {
    // Ignore malformed or blocked localStorage.
  }
  return { type: "personal", did: sessionDid };
}

export function rememberActiveContext(context: ActiveAccountContext): void {
  try {
    window.localStorage.setItem(
      ACTIVE_MANAGE_CONTEXT_KEY,
      JSON.stringify({ ...context, selectedAt: new Date().toISOString() }),
    );
    window.dispatchEvent(new Event(ACTIVE_CONTEXT_EVENT));
  } catch {
    // Non-critical; navigation still works without persisted context.
  }
}

// useSyncExternalStore requires a stable snapshot reference when nothing
// changed. readActiveContext() builds a fresh object each call, so we memoize
// and only hand out a new reference when the value actually changes.
//
// The cache is keyed PER sessionDid (not a single shared slot): several
// consumers can read with different sessionDids in the same commit — e.g. the
// nav reads with the signed-in DID while an engagement bar in an open record
// drawer reads with "" until its session resolves. A single slot would thrash
// between those keys, returning a fresh reference every render and driving
// useSyncExternalStore into an infinite update loop (React error #185).
const activeSnapshots = new Map<string, { raw: string; value: ActiveAccountContext }>();

function getActiveSnapshot(sessionDid: string): ActiveAccountContext {
  const value = readActiveContext(sessionDid);
  const raw = JSON.stringify(value);
  const cached = activeSnapshots.get(sessionDid);
  if (cached && cached.raw === raw) {
    return cached.value;
  }
  activeSnapshots.set(sessionDid, { raw, value });
  return value;
}

function subscribeActiveContext(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_MANAGE_CONTEXT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(ACTIVE_CONTEXT_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ACTIVE_CONTEXT_EVENT, listener);
  };
}

/** Subscribe to the active-account context (cross-tab + same-tab updates). */
export function useActiveAccountContext(
  sessionDid: string,
): [ActiveAccountContext, (context: ActiveAccountContext) => void] {
  const active = useSyncExternalStore(
    subscribeActiveContext,
    () => getActiveSnapshot(sessionDid),
    () => getActiveSnapshot(sessionDid),
  );

  // rememberActiveContext is a stable module-level reference, so consumers can
  // safely list it in effect dependencies without re-running every render.
  return [active, rememberActiveContext];
}

export function useAccountPathContextSync(options: {
  pathname: string;
  sessionDid: string;
  personalHandle?: string | null;
  groups: SwitcherGroup[];
  activeContext: ActiveAccountContext;
  setActiveContext: (context: ActiveAccountContext) => void;
}): void {
  const { pathname, sessionDid, personalHandle, groups, activeContext, setActiveContext } = options;
  const activeContextRef = useRef(activeContext);

  useEffect(() => {
    activeContextRef.current = activeContext;
  }, [activeContext]);

  useEffect(() => {
    const accountIdentifier = accountIdentifierFromPath(pathname);
    // Not on an account route (/account/<id>/...): leave the context untouched.
    if (!accountIdentifier) return;

    const match = findSwitcherGroupByIdentifier(groups, accountIdentifier);
    if (match) {
      const current = activeContextRef.current;
      if (current.type === "group" && current.did === match.groupDid) return;

      setActiveContext({
        type: "group",
        did: match.groupDid,
        identifier: switcherGroupIdentifier(match),
        role: match.role,
      });
      return;
    }

    // Not one of the user's organizations. Only sync to personal when this is
    // the user's OWN account route — visiting someone else's profile must not
    // change the active context.
    const normalized = accountIdentifier.trim().toLowerCase();
    const ownsPersonalRoute =
      normalized === sessionDid.trim().toLowerCase() ||
      (personalHandle ? normalized === personalHandle.trim().toLowerCase() : false);
    if (!ownsPersonalRoute) return;

    const current = activeContextRef.current;
    if (current.type === "personal" && current.did === sessionDid) return;
    setActiveContext({ type: "personal", did: sessionDid });
  }, [groups, pathname, sessionDid, personalHandle, setActiveContext]);
}
