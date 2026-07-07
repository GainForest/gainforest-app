"use client";

// Shared client store for the account switcher used by the header user menu,
// the sidebar profile row, and the manage-context buttons.
//
// Fetching/caching/deduping is handled by TanStack Query (the app-wide client
// provided by WagmiProvider): one query per session DID, 5-minute freshness,
// automatic in-flight dedupe across consumers. A localStorage mirror seeds the
// cache after hydration so the switcher paints instantly on reload without
// causing server/client hydration mismatches.
//
// The "active account context" (personal vs organization) remains a small
// hand-rolled localStorage + event store below — it's synchronous,
// cross-tab-synced UI state, not server data.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ACTIVE_MANAGE_CONTEXT_KEY, accountIdentifierFromPath } from "@/lib/links";
import type { CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";

export type AccountCard = { displayName: string | null; avatarUrl: string | null; handle: string | null };
export type SwitcherGroup = CgsGroupMembership & AccountCard;
type AccountListStatus = "idle" | "loading" | "ready" | "error";

export type ActiveAccountContext =
  | { type: "personal"; did: string; selectedAt?: string }
  | { type: "group"; did: string; identifier?: string; role?: CgsGroupMembership["role"]; selectedAt?: string };

const CACHE_KEY = "gainforest-account-switcher-cache";
const ACTIVE_CONTEXT_EVENT = "gainforest-active-account-context";
const TTL_MS = 5 * 60 * 1000;
const EMPTY_GROUP_RECHECK_MS = 30 * 1000;
const LOAD_ERROR_MESSAGE = "Could not load organizations.";

type AccountListData = {
  personal: AccountCard | null;
  groups: SwitcherGroup[];
  fetchedAt: number;
};

const accountListQueryKey = (sessionDid: string) => ["account-list", sessionDid] as const;

// ── localStorage mirror ──────────────────────────────────────────────────────

function readCache(sessionDid: string): AccountListData | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountListData & { sessionDid: string }>;
    if (parsed?.sessionDid !== sessionDid) return null;
    return {
      personal: parsed.personal ?? null,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeCache(sessionDid: string, data: AccountListData) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ sessionDid, personal: data.personal, groups: data.groups, fetchedAt: data.fetchedAt }),
    );
  } catch {
    // Storage may be blocked (private windows); the in-memory cache still works.
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

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

// ── fetching ────────────────────────────────────────────────────────────────

// CGS membership fetches can occasionally come back as an empty success after
// the app has been idle (usually while auth/session state is being refreshed).
// Do not let one suspicious empty response erase a known-good account list;
// keep the previous data once and schedule a recheck, only accepting "no orgs"
// after a second consecutive empty response.
const emptyGroupRefreshCounts = new Map<string, number>();
const emptyGroupRecheckTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleEmptyGroupsRecheck(queryClient: QueryClient, sessionDid: string) {
  if (emptyGroupRecheckTimers.has(sessionDid)) return;
  emptyGroupRecheckTimers.set(
    sessionDid,
    setTimeout(() => {
      emptyGroupRecheckTimers.delete(sessionDid);
      void queryClient.invalidateQueries({ queryKey: accountListQueryKey(sessionDid) });
    }, EMPTY_GROUP_RECHECK_MS),
  );
}

async function fetchAccountList(
  queryClient: QueryClient,
  sessionDid: string,
): Promise<AccountListData> {
  const previous = queryClient.getQueryData<AccountListData>(accountListQueryKey(sessionDid));

  const [personalResponse, groupResponse] = await Promise.all([
    fetch(`/api/account/card?did=${encodeURIComponent(sessionDid)}`).catch(() => null),
    fetch("/api/cgs/groups", { cache: "no-store" }).catch(() => null),
  ]);

  const fetchedPersonal = personalResponse?.ok ? ((await personalResponse.json()) as AccountCard) : null;
  const personal =
    hasAccountCardData(fetchedPersonal) || !hasAccountCardData(previous?.personal ?? null)
      ? fetchedPersonal
      : previous?.personal ?? null;

  if (!groupResponse?.ok) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  const payload = (await groupResponse.json().catch(() => ({}))) as { groups?: CgsGroupMembership[] };
  if (!Array.isArray(payload.groups)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  const hydratedGroups = await Promise.all(payload.groups.map(hydrateGroup));
  let groups = hydratedGroups;

  if (hydratedGroups.length > 0) {
    emptyGroupRefreshCounts.delete(sessionDid);
  } else if ((previous?.groups.length ?? 0) > 0) {
    const emptyCount = (emptyGroupRefreshCounts.get(sessionDid) ?? 0) + 1;
    emptyGroupRefreshCounts.set(sessionDid, emptyCount);
    if (emptyCount < 2) {
      groups = previous?.groups ?? [];
      scheduleEmptyGroupsRecheck(queryClient, sessionDid);
    } else {
      emptyGroupRefreshCounts.delete(sessionDid);
    }
  }

  const data: AccountListData = { personal, groups, fetchedAt: Date.now() };
  writeCache(sessionDid, data);
  return data;
}

// ── public hook ─────────────────────────────────────────────────────────────

export type UseAccountListResult = {
  status: AccountListStatus;
  sessionDid: string | null;
  personal: AccountCard | null;
  groups: SwitcherGroup[];
  error: string | null;
  fetchedAt: number;
  reload: () => Promise<void>;
};

const EMPTY_GROUPS: SwitcherGroup[] = [];

export function useAccountList(sessionDid: string | null): UseAccountListResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: accountListQueryKey(sessionDid ?? ""),
    queryFn: () => fetchAccountList(queryClient, sessionDid ?? ""),
    enabled: Boolean(sessionDid),
    // An empty group list is treated as immediately stale (mirrors the old
    // store, which only trusted non-empty results for the 5-minute TTL).
    staleTime: (q) => ((q.state.data?.groups.length ?? 0) > 0 ? TTL_MS : 0),
    // The old store never refetched on window focus; keep that behavior so
    // /api/cgs/groups isn't hammered on every tab switch.
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Seed the query cache from the localStorage mirror AFTER hydration (an
  // effect, not initialData) so server HTML and the first client render stay
  // identical — reading localStorage during render caused hydration
  // mismatches in the previous incarnations of this store.
  useEffect(() => {
    if (!sessionDid) return;
    const key = accountListQueryKey(sessionDid);
    const state = queryClient.getQueryState<AccountListData>(key);
    if (state?.data !== undefined) return;
    const cached = readCache(sessionDid);
    if (!cached) return;
    // Only seed when nothing fresher has landed in the meantime.
    if ((queryClient.getQueryState<AccountListData>(key)?.dataUpdatedAt ?? 0) > 0) return;
    queryClient.setQueryData<AccountListData>(key, cached, { updatedAt: cached.fetchedAt });
  }, [queryClient, sessionDid]);

  const data = query.data;
  const status: AccountListStatus = !sessionDid
    ? "idle"
    : data !== undefined
      ? "ready"
      : query.isError
        ? "error"
        : "loading";

  return {
    status,
    sessionDid,
    personal: data?.personal ?? null,
    groups: data?.groups ?? EMPTY_GROUPS,
    error: query.isError ? (query.error instanceof Error ? query.error.message : LOAD_ERROR_MESSAGE) : null,
    fetchedAt: data?.fetchedAt ?? 0,
    reload: async () => {
      if (!sessionDid) return;
      await query.refetch();
    },
  };
}

// ── active account context (personal vs organization) ──────────────────────

function readActiveContext(sessionDid: string): ActiveAccountContext {
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

function rememberActiveContext(context: ActiveAccountContext): void {
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
