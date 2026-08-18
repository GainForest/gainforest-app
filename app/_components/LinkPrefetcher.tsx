"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const IMPORTANT_ROUTES = [
  "/projects",
  "/organizations",
  "/observations",
  "/bioblitz",
  "/devices",
  "/status",
] as const;

const MAX_ANCHOR_PREFETCHES = 80;

type RouterWithFullPrefetch = ReturnType<typeof useRouter> & {
  prefetch: (href: string, options?: { kind?: "auto" | "full"; onInvalidate?: () => void }) => void;
};

function normalizeInternalHref(raw: string | null): string | null {
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return null;
  const url = new URL(raw, window.location.href);
  if (url.origin !== window.location.origin) return null;
  return `${url.pathname}${url.search}`;
}

export function LinkPrefetcher() {
  const router = useRouter() as RouterWithFullPrefetch;
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    const seen = seenRef.current;

    function prefetch(href: string | null) {
      if (!href || seen.has(href)) return;
      seen.add(href);
      router.prefetch(href, { kind: "full" });
    }

    function prefetchAnchor(anchor: HTMLAnchorElement | null) {
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      prefetch(normalizeInternalHref(anchor.getAttribute("href")));
    }

    const idle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 1));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;

    const idleId = idle(() => {
      IMPORTANT_ROUTES.forEach(prefetch);
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')).slice(0, MAX_ANCHOR_PREFETCHES);
      anchors.forEach(prefetchAnchor);
    });

    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            prefetchAnchor(entry.target as HTMLAnchorElement);
            observer?.unobserve(entry.target);
          }
        }
      }, { rootMargin: "600px" });
    }

    if (observer) {
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((anchor, index) => {
        if (index < MAX_ANCHOR_PREFETCHES) observer.observe(anchor);
      });
    }

    function onPointer(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      prefetchAnchor(target.closest("a[href]") as HTMLAnchorElement | null);
    }

    document.addEventListener("pointerover", onPointer, { passive: true });
    document.addEventListener("focusin", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });

    return () => {
      cancelIdle(idleId);
      observer?.disconnect();
      document.removeEventListener("pointerover", onPointer);
      document.removeEventListener("focusin", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [router]);

  return null;
}
