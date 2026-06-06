"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX_PENDING_MS = 10000;

function routeKey(pathname: string | null, searchParams: URLSearchParams | ReadonlyURLSearchParams | null) {
  const query = searchParams?.toString();
  return `${pathname ?? "/"}${query ? `?${query}` : ""}`;
}

type ReadonlyURLSearchParams = ReturnType<typeof useSearchParams>;

function isPlainInternalNavigation(anchor: HTMLAnchorElement, currentKey: string, event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  const nextKey = `${url.pathname}${url.search}`;
  if (nextKey === currentKey) return false;

  return true;
}

export function RouteChangeIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentKey = routeKey(pathname, searchParams);
  const currentKeyRef = useRef(currentKey);
  const timeoutRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (currentKeyRef.current !== currentKey) {
      currentKeyRef.current = currentKey;
      setPending(false);
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [currentKey]);

  useEffect(() => {
    function startPending() {
      setPending(true);
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setPending(false);
        timeoutRef.current = null;
      }, MAX_PENDING_MS);
    }

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (isPlainInternalNavigation(anchor, currentKeyRef.current, event)) startPending();
    }

    function onPopState() {
      startPending();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {pending ? (
        <motion.div
          key="route-progress"
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/15"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.div
            className="h-full rounded-r-full bg-primary shadow-[0_0_18px_rgba(93,126,69,0.45)]"
            initial={{ width: "8%", x: "-20%" }}
            animate={{ width: ["8%", "52%", "78%"], x: ["-20%", "18%", "28%"] }}
            transition={{ duration: 1.35, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
