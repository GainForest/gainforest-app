import "server-only";
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";

// In-memory OAuth state + session stores.
//
// Simocracy uses Redis (Upstash on Vercel, TCP locally) so its OAuth state
// survives across serverless invocations and across deploys. We don't have
// that infrastructure here, so we keep everything in process memory.
//
// `globalThis` survives Next.js HMR (each `pnpm dev` reload normally wipes
// module-scope state), which means a half-finished OAuth flow can complete
// across a hot reload. In production, sessions are wiped on server restart
// — fine for a landing page where the worst case is "user signs in again".
//
// If this app is ever deployed across multiple workers, swap these for the
// Redis adapters in simocracy-v2/lib/redis-state-store.ts.

interface StoreGlobals {
  state: Map<string, NodeSavedState>;
  session: Map<string, NodeSavedSession>;
  cookieSession: Map<string, { did: string; expiresAt: number }>;
}

const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function stores(): StoreGlobals {
  const g = globalThis as unknown as { __gfAuthStores?: StoreGlobals };
  if (!g.__gfAuthStores) {
    g.__gfAuthStores = {
      state: new Map(),
      session: new Map(),
      cookieSession: new Map(),
    };
  }
  return g.__gfAuthStores;
}

export const stateStore: NodeSavedStateStore = {
  async set(key, internalState) {
    stores().state.set(key, internalState);
  },
  async get(key) {
    return stores().state.get(key);
  },
  async del(key) {
    stores().state.delete(key);
  },
};

export const sessionStore: NodeSavedSessionStore = {
  async set(sub, session) {
    stores().session.set(sub, session);
  },
  async get(sub) {
    return stores().session.get(sub);
  },
  async del(sub) {
    stores().session.delete(sub);
  },
};

// Opaque cookie token → DID. The cookie itself never carries the DID, so
// stealing it doesn't leak the user's identity directly.
export const cookieSessionStore = {
  async set(token: string, did: string): Promise<void> {
    stores().cookieSession.set(token, {
      did,
      expiresAt: Date.now() + COOKIE_TTL_MS,
    });
  },
  async get(token: string): Promise<string | undefined> {
    const entry = stores().cookieSession.get(token);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      stores().cookieSession.delete(token);
      return undefined;
    }
    return entry.did;
  },
  async del(token: string): Promise<void> {
    stores().cookieSession.delete(token);
  },
};
