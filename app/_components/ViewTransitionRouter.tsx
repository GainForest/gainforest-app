"use client";

import { useCallback, useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Cross-route View Transitions without a library. `useViewTransitionNavigate`
// wraps `router.push` in `document.startViewTransition`, returning from the
// update callback a promise that resolves once the destination route has
// committed. The commit signal comes from `ViewTransitionNavigationSync`,
// which watches the pathname and MUST stay mounted in the root layout so it
// survives the navigation.
//
// While the transition runs, `html.vt-nav` is set so globals.css can scope
// navigation-only view-transition styles (shared project-photo morphs) apart
// from the theme toggle's ripple, which owns `html.vt-theme-ripple`.

type ViewTransitionLike = {
  finished: Promise<void>;
};

type DocWithViewTransition = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike;
};

export type SharedElementOptions = {
  /** Element on the outgoing page that should morph into its counterpart. */
  element?: HTMLElement | null;
  /** Unique `view-transition-name` to assign to that element for the flight. */
  name?: string;
  /** Optional `view-transition-class` so CSS can style the pair generically. */
  transitionClass?: string;
  /** Selector for the incoming morph target. Routes with a `loading.tsx`
   * commit their skeleton first; waiting for this element keeps the shared
   * morph instead of snapshotting the skeleton. Bounded by the same deadline
   * as the navigation itself. */
  readySelector?: string;
};

const pendingResolvers = new Set<() => void>();

/** Poll (timers keep firing while the transition suppresses rendering) until
 * the selector matches or the deadline passes. */
function waitForSelector(selector: string, deadline: number): Promise<void> {
  if (document.querySelector(selector)) return Promise.resolve();
  return new Promise((resolve) => {
    const interval = window.setInterval(() => {
      if (document.querySelector(selector) || performance.now() >= deadline) {
        window.clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

// Safety valve: the browser freezes rendering while the update callback is
// pending, so never wait longer than this for a slow route — the transition
// simply degrades into a plain navigation. Kept just under Chrome's own ~4s
// abort deadline. Hover prefetching (LinkPrefetcher) makes the common case
// fast enough that this rarely fires.
const NAVIGATION_TIMEOUT_MS = 3500;

/** Mounted once in the root layout; resolves in-flight transitions as soon as
 * the new route commits. */
export function ViewTransitionNavigationSync() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    for (const resolve of [...pendingResolvers]) resolve();
    pendingResolvers.clear();
  }, [pathname]);
  return null;
}

export function useViewTransitionNavigate() {
  const router = useRouter();

  return useCallback(
    (href: string, shared?: SharedElementOptions) => {
      const doc = document as DocWithViewTransition;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (typeof doc.startViewTransition !== "function" || reduceMotion) {
        router.push(href);
        return;
      }

      const root = document.documentElement;
      const element = shared?.element ?? null;
      if (element && shared?.name) {
        element.style.setProperty("view-transition-name", shared.name);
        if (shared.transitionClass) {
          element.style.setProperty("view-transition-class", shared.transitionClass);
        }
      }
      root.classList.add("vt-nav");

      const cleanup = () => {
        root.classList.remove("vt-nav");
        if (element) {
          element.style.removeProperty("view-transition-name");
          element.style.removeProperty("view-transition-class");
        }
      };

      const deadline = performance.now() + NAVIGATION_TIMEOUT_MS;
      const transition = doc.startViewTransition(async () => {
        await new Promise<void>((resolve) => {
          const done = () => {
            pendingResolvers.delete(done);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(done, NAVIGATION_TIMEOUT_MS);
          pendingResolvers.add(done);
          router.push(href);
        });
        // The route may have committed only its loading skeleton; give the
        // real morph target a bounded chance to stream in.
        if (shared?.readySelector) await waitForSelector(shared.readySelector, deadline);
      });
      transition.finished.then(cleanup, cleanup);
    },
    [router],
  );
}
