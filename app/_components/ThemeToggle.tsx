"use client";

import { useEffect, useState, type MouseEvent } from "react";

// Light/dark toggle with a circular View-Transition reveal (ported from
// broadlistening-frontend). On click we set the new theme inside
// `document.startViewTransition(...)` and grow a `clip-path: circle()` on
// `::view-transition-new(root)` out from the click origin, so the new theme
// wipes in radially. Falls back to an instant swap when the API is missing
// (Firefox / older Safari) or the user prefers reduced motion. The pre-paint
// class is set by the inline script in layout (no FOUC).

const STORAGE_KEY = "bumiscan-theme";
const RIPPLE_DURATION_MS = 1200;

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    /* private mode / storage disabled */
  }
}

function eventOrigin(event: MouseEvent<HTMLButtonElement>) {
  // Real click → pointer position; keyboard activation (detail 0) → button centre.
  if (event.detail > 0) return { x: event.clientX, y: event.clientY };
  const r = event.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function runThemeTransition(
  origin: { x: number; y: number },
  next: boolean,
  onDone: (dark: boolean) => void,
) {
  const doc = document as DocWithVT;
  const update = () => {
    applyTheme(next);
    onDone(next);
  };

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || typeof doc.startViewTransition !== "function") {
    update();
    return;
  }

  const farX = Math.max(origin.x, window.innerWidth - origin.x);
  const farY = Math.max(origin.y, window.innerHeight - origin.y);
  const radius = Math.ceil(Math.hypot(farX, farY));

  const root = document.documentElement;
  root.style.setProperty("--theme-ripple-x", `${origin.x}px`);
  root.style.setProperty("--theme-ripple-y", `${origin.y}px`);

  const transition = doc.startViewTransition!(update);
  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
          offset: [0, 0.06, 1],
        },
        {
          duration: RIPPLE_DURATION_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      /* transition skipped — theme already applied in `update` */
    });
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    runThemeTransition(eventOrigin(event), !isDark, setIsDark);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={mounted ? isDark : undefined}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-foreground/75 transition-colors hover:border-foreground/35 hover:text-foreground ${className}`}
    >
      {/* Default to the moon (light mode) until mounted to match SSR. */}
      {mounted && isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
