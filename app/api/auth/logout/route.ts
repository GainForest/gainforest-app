import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieSessionStore } from "../../../_lib/auth-store";
import { authConfig } from "../../../_lib/auth-config";
import { SESSION_COOKIE } from "../../../_lib/auth-session";

// POST /api/auth/logout — clear the session cookie and drop the in-memory
// token → DID mapping. We do NOT revoke the upstream OAuth session here
// (simocracy doesn't either) — that's a future enhancement if needed.
export async function POST(): Promise<NextResponse> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await cookieSessionStore.del(token);
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/", authConfig.baseUrl), {
    status: 303,
  });
}

export const GET = POST;
