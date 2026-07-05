import { NextResponse, type NextRequest } from "next/server";
import { getProxyBlockResult } from "@/lib/proxy-guards";
import {
  LANGUAGE_COOKIE_NAME,
  resolvePreferredLanguageFromHeader,
  resolveSupportedLanguage,
} from "@/lib/i18n/languages";
import {
  LOCALE_REQUEST_HEADER_NAME,
  getLocalizedPathnames,
  getPathLocale,
  stripLocaleFromPathname,
  withLocalePrefix,
} from "@/lib/i18n/routing";

function appendRequestCookie(
  existingCookieHeader: string | null,
  name: string,
  value: string,
): string {
  const encodedCookie = `${name}=${encodeURIComponent(value)}`;
  return existingCookieHeader ? `${existingCookieHeader}; ${encodedCookie}` : encodedCookie;
}

function isLocaleRoutedPath(pathname: string): boolean {
  return !pathname.startsWith("/api/");
}

function getSeoLinkHeader(request: NextRequest, pathname: string): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "");
  const origin = `${proto}://${host}`;
  const canonicalUrl = new URL(pathname, origin);
  const alternateLinks = Object.entries(getLocalizedPathnames(pathname)).map(
    ([locale, localizedPathname]) => {
      const url = new URL(localizedPathname, origin);
      return `<${url.toString()}>; rel="alternate"; hreflang="${locale}"`;
    },
  );

  return [`<${canonicalUrl.toString()}>; rel="canonical"`, ...alternateLinks].join(
    ", ",
  );
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";

  // Redirect localhost to 127.0.0.1 (required for ATProto OAuth loopback).
  if (hostname.startsWith("localhost:")) {
    const redirectUrl = new URL(request.url);
    redirectUrl.hostname = "127.0.0.1";
    redirectUrl.port = hostname.split(":")[1] || "3040";
    return NextResponse.redirect(redirectUrl, { status: 307 });
  }

  const blockResult = getProxyBlockResult({
    method: request.method,
    pathname: request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent"),
  });

  if (blockResult) {
    if (blockResult.status === 403) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    return new NextResponse(null, { status: 404 });
  }

  const pathnameLocale = getPathLocale(request.nextUrl.pathname);
  const savedLocale = request.cookies.get(LANGUAGE_COOKIE_NAME)?.value;
  const detectedLocale = resolvePreferredLanguageFromHeader(
    request.headers.get("accept-language"),
  );
  const resolvedLocale =
    pathnameLocale ??
    (savedLocale ? resolveSupportedLanguage(savedLocale) : detectedLocale);

  if (!isLocaleRoutedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!pathnameLocale) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = withLocalePrefix(
      request.nextUrl.pathname,
      resolvedLocale,
    );
    const response = NextResponse.redirect(redirectUrl, { status: 307 });
    response.headers.set("Link", getSeoLinkHeader(request, redirectUrl.pathname));
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_REQUEST_HEADER_NAME, pathnameLocale);
  requestHeaders.set(
    "cookie",
    appendRequestCookie(
      request.headers.get("cookie"),
      LANGUAGE_COOKIE_NAME,
      pathnameLocale,
    ),
  );

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = stripLocaleFromPathname(request.nextUrl.pathname);

  // Forward the locale-stripped pathname so server components can read it via headers().
  requestHeaders.set("x-pathname", rewriteUrl.pathname);

  const response = NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders,
    },
  });
  response.cookies.set(LANGUAGE_COOKIE_NAME, pathnameLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  response.headers.set(
    "Link",
    getSeoLinkHeader(request, request.nextUrl.pathname),
  );

  return response;
}

export const config = {
  matcher: [
    // `oauth/` is excluded so ATProto client-metadata documents (e.g. the
    // Android app's) are served directly — OAuth servers refuse redirects
    // when fetching a client_id URL.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|apple-icon\\.png|icon\\.png|icons/|og/|oauth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|md|xml|woff|woff2|mp4|webm|mov|m4v|ogg|ogv)$).*)",
  ],
};
