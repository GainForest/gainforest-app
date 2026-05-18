import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { Agent } from "@atproto/api";
import { getClient } from "./auth-client";
import { cookieSessionStore } from "./auth-store";

// Port of simocracy's `lib/atproto-session.ts`.
//
// The cookie carries an opaque token; we resolve token → DID via the
// in-memory cookieSessionStore, then ask the OAuth client to restore the
// underlying ATProto session.

export const SESSION_COOKIE = "gf-session-token";

export const getSession = cache(async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const did = await cookieSessionStore.get(token);
  if (!did) return null;
  try {
    const client = await getClient();
    return await client.restore(did);
  } catch (error) {
    console.error(
      "[gf-auth] failed to restore session",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
});

export const getAgent = cache(async function getAgent() {
  const session = await getSession();
  return session ? new Agent(session) : null;
});

export async function getUserDid(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await cookieSessionStore.get(token)) ?? null;
}
