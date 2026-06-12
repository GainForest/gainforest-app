"use client";

import { getAuthBaseUrl, getAuthProvider } from "./auth";

const AUTH_ERROR_PARAMS = new Set([
  "auth_failed",
  "epds_not_configured",
  "missing_login_identifier",
  "unknown_epds_provider",
]);

export function getCurrentReturnToUrl(): string {
  const url = new URL(window.location.href);
  const error = url.searchParams.get("error");
  if (error && AUTH_ERROR_PARAMS.has(error)) {
    url.searchParams.delete("error");
  }
  return `${url.pathname}${url.search}${url.hash}` || "/manage";
}

function getCurrentAbsoluteReturnToUrl(): string {
  return new URL(getCurrentReturnToUrl(), window.location.origin).toString();
}

function getAuthCompleteReturnToUrl(): string {
  const destination = getCurrentReturnToUrl();
  const url = new URL("/auth/complete", window.location.origin);
  url.searchParams.set("redirect", destination);
  return url.toString();
}

export function buildLoginUrl(options: { email?: string; handle?: string } = {}): string {
  const url = new URL("/login", getAuthBaseUrl());
  url.searchParams.set("returnTo", getAuthCompleteReturnToUrl());

  const provider = getAuthProvider();
  if (provider) {
    url.searchParams.set("provider", provider);
  }

  const email = options.email?.trim();
  if (email) {
    url.searchParams.set("email", email);
  }

  const handle = options.handle?.trim();
  if (handle) {
    url.searchParams.set("handle", handle);
  }

  return url.toString();
}

export function buildLogoutUrl(): string {
  const url = new URL("/logout", getAuthBaseUrl());
  url.searchParams.set("returnTo", getCurrentAbsoluteReturnToUrl());
  return url.toString();
}

export function redirectToLogin(options: { email?: string; handle?: string } = {}): void {
  window.location.href = buildLoginUrl(options);
}

export function redirectToLogout(): void {
  window.location.href = buildLogoutUrl();
}
