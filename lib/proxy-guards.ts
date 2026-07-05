import { SUPPORTED_LOCALES } from "@/lib/i18n/languages";

const TRUSTED_PREVIEW_USER_AGENTS = [
  "slackbot",
  "slack-imgproxy",
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "skypeuripreview",
] as const;

const BLOCKED_BOT_USER_AGENTS = [
  "gptbot",
  "chatgpt-user",
  "claudebot",
  "anthropic-ai",
  "ccbot",
  "cohere-ai",
  "perplexitybot",
  "perplexity-user",
  "bytespider",
  "amazonbot",
  "petalbot",
  "applebot-extended",
  "google-extended",
  "diffbot",
  "omgili",
] as const;

const GENERIC_BOT_USER_AGENT_PATTERN = /\b(bot|crawler|spider|scraper)\b/i;
const DID_ROUTE_SEGMENT_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/i;
const ATPROTO_HANDLE_PATTERN =
  /^(?=.{3,253}$)(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
const RECORD_KEY_ROUTE_SEGMENT_PATTERN = /^[A-Za-z0-9._:~-]+$/;

const PROXY_BYPASS_PREFIXES = ["/api/"] as const;
const ACCOUNT_ID_ROUTES = ["account", "cert", "bumicert", "projects", "observations"] as const;
const RECORD_DETAIL_ROUTES = ["cert", "bumicert", "projects", "observations"] as const;

type ProxyBlockReason =
  | "blocked-bot-user-agent"
  | "invalid-account-did-or-handle"
  | "invalid-record-rkey";

export type ProxyBlockResult = {
  status: 403 | 404;
  reason: ProxyBlockReason;
};

type ProxyGuardInput = {
  method: string;
  pathname: string;
  userAgent: string | null;
};

export function getProxyBlockResult({
  method,
  pathname,
  userAgent,
}: ProxyGuardInput): ProxyBlockResult | null {
  if (!shouldInspectProxyRequest(method, pathname)) {
    return null;
  }

  if (isBlockedBotUserAgent(userAgent ?? "")) {
    return {
      status: 403,
      reason: "blocked-bot-user-agent",
    };
  }

  const invalidPathReason = getInvalidPathReason(pathname);

  if (invalidPathReason) {
    return {
      status: 404,
      reason: invalidPathReason,
    };
  }

  return null;
}

export function isBlockedBotUserAgent(userAgent: string): boolean {
  const normalizedUserAgent = userAgent.trim().toLowerCase();

  if (!normalizedUserAgent) {
    return false;
  }

  if (includesAny(normalizedUserAgent, TRUSTED_PREVIEW_USER_AGENTS)) {
    return false;
  }

  return (
    includesAny(normalizedUserAgent, BLOCKED_BOT_USER_AGENTS) ||
    GENERIC_BOT_USER_AGENT_PATTERN.test(normalizedUserAgent)
  );
}

function shouldInspectProxyRequest(
  method: string,
  pathname: string,
): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  return !PROXY_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function getInvalidPathReason(pathname: string): Exclude<
  ProxyBlockReason,
  "blocked-bot-user-agent"
> | null {
  const segments = stripSupportedLocalePrefix(pathname.split("/").filter(Boolean));
  const [route, accountId, recordRkey] = segments;

  if (!route || !ACCOUNT_ID_ROUTES.some((accountRoute) => accountRoute === route)) {
    return null;
  }

  if (accountId) {
    const segment = safeDecodePathSegment(accountId);

    if (!segment || !isValidAccountRouteIdentifier(segment)) {
      return "invalid-account-did-or-handle";
    }
  }

  if (
    recordRkey &&
    RECORD_DETAIL_ROUTES.some((recordRoute) => recordRoute === route)
  ) {
    const segment = safeDecodePathSegment(recordRkey);

    if (!segment || !RECORD_KEY_ROUTE_SEGMENT_PATTERN.test(segment)) {
      return "invalid-record-rkey";
    }
  }

  return null;
}

function stripSupportedLocalePrefix(segments: string[]): string[] {
  const [maybeLocale, ...rest] = segments;
  return SUPPORTED_LOCALES.some((locale) => locale === maybeLocale) ? rest : segments;
}

function safeDecodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isValidAccountRouteIdentifier(value: string): boolean {
  return DID_ROUTE_SEGMENT_PATTERN.test(value) || ATPROTO_HANDLE_PATTERN.test(value);
}
