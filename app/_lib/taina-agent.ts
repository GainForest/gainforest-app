import "server-only";
import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "./auth";
import { TAINA_AGENT_KEY_NAME, isTainaAgentKeyName } from "./taina-shared";

/**
 * Tainá agent runtime client.
 *
 * Tainá (../agent-village) is GainForest's Telegram-first field assistant: a
 * person connects their own Telegram bot (made with @BotFather), chats with
 * Tainá about what they see in nature, and Tainá records observations under
 * their account. The bots run inside an always-on Flue runtime; this module is
 * the only place bumicerts talks to it.
 *
 * Publishing uses a regular GainForest AI-agent key (`gf_pat_…`) minted from
 * the user's sign-in via the central auth service — the same keys managed in
 * Settings → AI agent keys, where the Tainá one is recognisable by name. The
 * agent follows the canonical /skill.md guide with that key; there is no
 * bespoke upload path.
 *
 * All calls are server-side. Flue calls are authenticated with a shared
 * secret; auth-service calls forward the signed-in browser's cookie. Who is
 * provisioning always comes from the bumicerts auth session — never from a
 * request body.
 */

const DEV_FLUE_BASE_URL = "http://127.0.0.1:3583";
const DEV_PROVISION_SECRET = "dev-secret-change-me";

function flueBaseUrl(): string {
  return (
    process.env.TAINA_FLUE_BASE_URL?.trim() ||
    process.env.FLUE_BASE_URL?.trim() ||
    DEV_FLUE_BASE_URL
  ).replace(/\/$/, "");
}

function provisionSecret(): string {
  return (
    process.env.TAINA_PROVISION_SHARED_SECRET?.trim() ||
    process.env.PROVISION_SHARED_SECRET?.trim() ||
    DEV_PROVISION_SECRET
  );
}

async function flueRequest<T>(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(`${flueBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-provision-secret": provisionSecret(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    // Fail fast rather than hang a serverless invocation.
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, data };
}

/* ─────────────────────── GainForest agent keys (gf_pat_…) ─────────────────────── */

type AgentTokenMeta = { id: string; name: string; tokenPrefix?: string };

async function authTokensRequest(
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>,
): Promise<Response> {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  return fetch(new URL("/api/account/tokens", getAuthBaseUrl()), {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

/** List the ids of the user's existing Tainá-linked agent keys. */
export async function listTainaAgentKeyIds(): Promise<string[]> {
  const response = await authTokensRequest("GET");
  if (!response.ok) return [];
  const data = (await response.json().catch(() => ({}))) as { tokens?: AgentTokenMeta[] };
  return (data.tokens ?? [])
    .filter((token) => isTainaAgentKeyName(token.name))
    .map((token) => token.id);
}

/**
 * Mint a fresh GainForest agent key for the Tainá bot. The key carries the
 * canonical Tainá name so Settings → AI agent keys shows which key is the
 * bot's. Returns the plaintext token (`gf_pat_…`) — shown/stored once.
 */
export async function mintTainaAgentKey(): Promise<string> {
  const response = await authTokensRequest("POST", { name: TAINA_AGENT_KEY_NAME });
  const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!response.ok || !data.token) {
    throw new Error(data.error ?? `agent key mint failed (${response.status})`);
  }
  return data.token;
}

/** Revoke agent keys by id (best-effort; used to retire old Tainá keys). */
export async function revokeAgentKeys(ids: string[]): Promise<void> {
  for (const id of ids) {
    await authTokensRequest("DELETE", { id }).catch(() => {});
  }
}

/* ─────────────────────────────── Runtime calls ─────────────────────────────── */

export type TainaProvisionResult = {
  agentId?: string;
  botUrl?: string;
  botUsername?: string;
  activationCode?: string;
  activateUrl?: string;
  error?: string;
};

export async function provisionTainaBot(input: {
  did: string;
  handle: string;
  botToken: string;
  focus: string;
  pat: string;
}): Promise<{ ok: boolean; status: number; data: TainaProvisionResult }> {
  return flueRequest<TainaProvisionResult>("/provision", input);
}

export type TainaChatMessage = { role: "user" | "assistant"; text: string; ts: string };

export type TainaDashboardData = {
  provisioned: boolean;
  bot: string | null;
  botUrl: string | null;
  focus: string | null;
  apiKey: string | null;
  provisionedAt: string | null;
  activated?: boolean;
  activationCode?: string | null;
  activateUrl?: string | null;
  hasChat: boolean;
  messages: TainaChatMessage[];
  /** The observer's USER.md profile stored with the agent (null when unset). */
  userProfile?: string | null;
  /** Model spend vs. allowance, in USD. Absent on older runtimes. */
  credits?: { usedUsd: number; allowanceUsd: number } | null;
  error?: string;
};

export async function fetchTainaDashboard(did: string): Promise<{ ok: boolean; status: number; data: TainaDashboardData }> {
  return flueRequest<TainaDashboardData>("/dashboard", { did });
}

/** Tell the runtime which key the bot should publish with (or clear it). */
export async function setTainaKey(did: string, pat: string | null): Promise<void> {
  await flueRequest("/key", { did, pat });
}

/**
 * Save (or clear, with an empty string) the user's USER.md profile on the
 * agent runtime — the personal Markdown that tells Tainá who this observer is.
 */
export async function saveTainaProfile(
  did: string,
  profile: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const { ok, status, data } = await flueRequest<{ ok?: boolean; error?: string }>("/profile", {
    did,
    profile,
  });
  return { ok, status, error: data.error };
}

/**
 * Reset (disconnect) the user's Tainá agent: the runtime stops their bot and
 * forgets its record — bot token, key, profile and credit tally. Recorded
 * observations live on the user's own account and are never touched.
 */
export async function deprovisionTaina(
  did: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const { ok, status, data } = await flueRequest<{ ok?: boolean; error?: string }>("/deprovision", {
    did,
  });
  return { ok, status, error: data.error };
}

/**
 * Restart the user's conversation with Tainá: the runtime bumps the session
 * epoch (fresh agent conversation), wipes the visible transcript, and greets
 * the observer in the new session.
 */
export async function resetTainaSession(did: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const { ok, status, data } = await flueRequest<{ ok?: boolean; error?: string }>("/reset", { did });
  return { ok, status, error: data.error };
}
