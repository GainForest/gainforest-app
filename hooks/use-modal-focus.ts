"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const modalStack: symbol[] = [];
let scrollLockDepth = 0;
let originalBodyOverflow = "";

type OutsideState = {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
};

export function topModalToken<T>(stack: readonly T[]): T | undefined {
  return stack.at(-1);
}

export function tabWrapIndex(currentIndex: number, length: number, backwards: boolean): number | null {
  if (length <= 0) return null;
  if (backwards && currentIndex <= 0) return length - 1;
  if (!backwards && (currentIndex < 0 || currentIndex >= length - 1)) return 0;
  return null;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hidden &&
      element.getClientRects().length > 0 &&
      window.getComputedStyle(element).visibility !== "hidden" &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]"),
  );
}

function hideOutsideBranch(container: HTMLElement): () => void {
  const states: OutsideState[] = [];
  let branch: HTMLElement = container;
  let parent = branch.parentElement;

  while (parent) {
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
      states.push({
        element: sibling,
        inert: sibling.inert,
        ariaHidden: sibling.getAttribute("aria-hidden"),
      });
      sibling.inert = true;
      sibling.setAttribute("aria-hidden", "true");
    }
    branch = parent;
    parent = parent.parentElement;
  }

  return () => {
    for (const state of states.reverse()) {
      state.element.inert = state.inert;
      if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
      else state.element.setAttribute("aria-hidden", state.ariaHidden);
    }
  };
}

function lockBodyScroll(): () => void {
  if (scrollLockDepth === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockDepth += 1;
  return () => {
    scrollLockDepth = Math.max(0, scrollLockDepth - 1);
    if (scrollLockDepth === 0) document.body.style.overflow = originalBodyOverflow;
  };
}

export function useModalFocus({
  active = true,
  containerRef,
  initialFocusRef,
  onEscape,
}: {
  active?: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape: () => void;
}) {
  const tokenRef = useRef(Symbol("modal-focus"));
  const restoreTargetRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  // Capture the invoking control before URL/state effects can move focus during
  // the render that mounts the modal. Actual modal focus waits for useEffect so
  // the complete dialog subtree (and forwarded close-button ref) is ready.
  useLayoutEffect(() => {
    if (!active) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      restoreTargetRef.current = activeElement;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const token = tokenRef.current;
    const previouslyFocused = restoreTargetRef.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    modalStack.push(token);
    const ensureInitialFocus = () => {
      if (topModalToken(modalStack) !== token || !container.isConnected) return;
      if (container.contains(document.activeElement)) return;
      const target = initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
      if (target.isConnected) target.focus();
    };
    const focusFrame = window.requestAnimationFrame(ensureInitialFocus);
    // A shallow URL update can move focus back to <body> after passive effects.
    // Retry once after that navigation settles, without disturbing any focus
    // the visitor has already moved inside the modal.
    const focusTimer = window.setTimeout(ensureInitialFocus, 250);
    const restoreOutside = hideOutsideBranch(container);
    const unlockBodyScroll = lockBodyScroll();

    const onKeyDown = (event: KeyboardEvent) => {
      if (topModalToken(modalStack) !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = tabWrapIndex(currentIndex, focusable.length, event.shiftKey);
      if (nextIndex === null) return;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      const index = modalStack.lastIndexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      restoreOutside();
      unlockBodyScroll();
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      });
    };
  }, [active, containerRef, initialFocusRef]);
}
