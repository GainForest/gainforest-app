import "server-only";

import { headers } from "next/headers";

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function originFromHeaders(headerList: Headers, fallbackUrl?: string): string {
  const forwardedHost = firstHeaderValue(headerList.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(headerList.get("host"));

  if (host) {
    const forwardedProto = firstHeaderValue(headerList.get("x-forwarded-proto"));
    const proto = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  if (fallbackUrl) {
    return new URL(fallbackUrl).origin.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

export async function getRequestOrigin(): Promise<string> {
  return originFromHeaders(await headers());
}

export function getRequestOriginFromRequest(request: Request): string {
  return originFromHeaders(request.headers, request.url);
}
