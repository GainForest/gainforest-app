"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  setAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics/consent";
import { SUPPORTED_LOCALES } from "@/lib/i18n/languages";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { isTreeUploadTrackingPath } from "@/lib/analytics/tree-upload";
import { useAnalyticsConsent } from "@/lib/analytics/use-analytics-consent";
import { links } from "@/lib/links";

type ContentsquareCommand = [string, ...unknown[]];

declare global {
  interface Window {
    _uxa?: ContentsquareCommand[];
    CS_CONF?: unknown;
  }
}

type ContentsquareProviderProps = {
  children: React.ReactNode;
  enabled: boolean;
};

function getTrackedPath(pathname: string): string {
  const canonicalPathname = stripLocaleFromPathname(pathname);
  if (typeof window === "undefined") return canonicalPathname;

  const query = getTrackedQuery();
  return query.length > 0 ? `${canonicalPathname}?${query}` : canonicalPathname;
}

function getTrackedQuery(): string {
  if (typeof window === "undefined") return "";

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("mode") === "upload" ? "mode=upload" : "";
}

function pushContentsquareCommand(command: ContentsquareCommand): void {
  if (typeof window === "undefined") return;
  window._uxa = window._uxa ?? [];
  window._uxa.push(command);
}

function pushContentsquarePrivacyCommand(command: "optin" | "optout"): void {
  pushContentsquareCommand([command]);
}

function clearContentsquareOptOutCookie(): void {
  if (typeof window === "undefined") return;

  const hostnameParts = window.location.hostname.split(".");
  const domains = new Set<string | undefined>([undefined, window.location.hostname]);

  for (let index = 1; index < hostnameParts.length - 1; index += 1) {
    domains.add(`.${hostnameParts.slice(index).join(".")}`);
  }

  for (const domain of domains) {
    document.cookie = [
      "_cs_optout=",
      "Max-Age=0",
      "path=/",
      "Secure",
      "SameSite=Lax",
      domain ? `domain=${domain}` : null,
    ]
      .filter(Boolean)
      .join("; ");
  }
}

function isContentsquareLoaded(): boolean {
  return typeof window !== "undefined" && window.CS_CONF !== undefined;
}

function ContentsquareRouteTracker({
  consent,
  isTreeUploadSurface,
}: {
  consent: AnalyticsConsent | null;
  isTreeUploadSurface: boolean;
}) {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTreeUploadSurface) {
      lastTrackedPathRef.current = null;
      return;
    }

    if (consent !== "granted" || !pathname) return;

    const path = getTrackedPath(pathname);
    if (lastTrackedPathRef.current === path) return;

    lastTrackedPathRef.current = path;
    if (isContentsquareLoaded()) {
      pushContentsquareCommand(["trackPageview", path]);
    } else {
      pushContentsquareCommand(["setPath", stripLocaleFromPathname(pathname)]);
      const query = getTrackedQuery();
      if (query.length > 0) pushContentsquareCommand(["setQuery", query]);
    }
  }, [consent, isTreeUploadSurface, pathname]);

  return null;
}

function ContentsquareConsentCard({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="fixed right-4 bottom-4 left-4 z-40 sm:left-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-md"
      role="region"
      aria-labelledby="contentsquare-consent-title"
      aria-describedby="contentsquare-consent-description"
    >
      <div className="rounded-3xl border border-border bg-background/95 p-5 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p id="contentsquare-consent-title" className="text-sm font-medium text-foreground">
              Help us improve tree uploads
            </p>
            <p id="contentsquare-consent-description" className="text-xs leading-relaxed text-muted-foreground">
              With your permission, Certs can save a short video of your
              screen during tree uploads. This helps us see where the flow is
              confusing and turn feedback into fixes. You can say no and keep
              using the upload.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={onDecline}>
              No thanks
            </Button>
            <Button onClick={onAccept}>Allow screen video</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContentsquareProvider({ children, enabled }: ContentsquareProviderProps) {
  const pathname = usePathname();
  const consent = useAnalyticsConsent();
  const activeUploadTrackingRef = useRef(false);
  const tagId = process.env.NEXT_PUBLIC_CONTENTSQUARE_TAG_ID?.trim();
  const scriptSrc = useMemo(
    () => (tagId ? links.external.contentsquareUxaTag(tagId) : null),
    [tagId],
  );
  const isTreeUploadSurface =
    enabled && pathname ? isTreeUploadTrackingPath(pathname) : false;
  const shouldShowConsentCard =
    scriptSrc !== null && consent === null && isTreeUploadSurface;

  const handleAccept = () => {
    setAnalyticsConsent("granted");
  };

  const handleDecline = () => {
    setAnalyticsConsent("denied");
    pushContentsquarePrivacyCommand("optout");
  };

  useEffect(() => {
    if (consent !== "granted" || scriptSrc === null || !isTreeUploadSurface) return;

    clearContentsquareOptOutCookie();
    pushContentsquarePrivacyCommand("optin");
    activeUploadTrackingRef.current = true;

    return () => {
      if (!activeUploadTrackingRef.current) return;
      activeUploadTrackingRef.current = false;
      pushContentsquarePrivacyCommand("optout");
    };
  }, [consent, isTreeUploadSurface, scriptSrc]);

  return (
    <>
      {consent === "granted" && scriptSrc && isTreeUploadSurface ? (
        <Script id="contentsquare-main-tag" strategy="afterInteractive">
          {`
            (function () {
              window._uxa = window._uxa || [];
              function getTrackedQuery() {
                var searchParams = new URLSearchParams(window.location.search);
                return searchParams.get("mode") === "upload" ? "mode=upload" : "";
              }
              function getCanonicalPathname() {
                var locales = ${JSON.stringify(SUPPORTED_LOCALES)};
                var parts = window.location.pathname.split("/").filter(Boolean);
                if (parts.length > 0 && locales.indexOf(parts[0]) !== -1) {
                  var stripped = window.location.pathname.slice(parts[0].length + 1);
                  return stripped.charAt(0) === "/" ? stripped : "/" + stripped;
                }
                return window.location.pathname;
              }
              function getTrackedPath() {
                var query = getTrackedQuery();
                var pathname = getCanonicalPathname();
                return pathname + (query ? "?" + query : "");
              }
              if (typeof CS_CONF === "undefined") {
                window._uxa.push(["setPath", getCanonicalPathname()]);
                var query = getTrackedQuery();
                if (query) window._uxa.push(["setQuery", query]);
                var tag = document.createElement("script");
                tag.type = "text/javascript";
                tag.async = true;
                tag.src = ${JSON.stringify(scriptSrc)};
                document.getElementsByTagName("head")[0].appendChild(tag);
              } else {
                window._uxa.push(["trackPageview", getTrackedPath()]);
              }
            })();
          `}
        </Script>
      ) : null}

      <Suspense fallback={null}>
        <ContentsquareRouteTracker
          consent={consent}
          isTreeUploadSurface={isTreeUploadSurface}
        />
      </Suspense>

      {children}

      {shouldShowConsentCard ? (
        <ContentsquareConsentCard onAccept={handleAccept} onDecline={handleDecline} />
      ) : null}
    </>
  );
}
