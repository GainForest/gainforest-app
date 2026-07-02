"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Sidebar light/dark toggle with a circular View-Transition reveal. On click
// we set the new theme inside `document.startViewTransition(...)` and grow a
// `clip-path: circle()` on `::view-transition-new(root)` out from the click
// origin. Falls back to an instant swap when the API is missing or the user
// prefers reduced motion. The pre-paint class is set by the inline script in
// the root layout (no FOUC).

const RIPPLE_DURATION_MS = 1200;
const STORAGE_KEY = "bumicerts-theme";

type DocWithViewTransitions = Document & {
  startViewTransition?: (updateCallback: () => void) => { ready: Promise<void> };
};

function getEventOrigin(event: MouseEvent<HTMLButtonElement>) {
  if (event.detail > 0) return { originX: event.clientX, originY: event.clientY };

  const rect = event.currentTarget.getBoundingClientRect();
  return {
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2,
  };
}

function runThemeTransition(origin: { originX: number; originY: number }, updateTheme: () => void) {
  const doc = document as DocWithViewTransitions;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !doc.startViewTransition) {
    updateTheme();
    return;
  }

  const farthestX = Math.max(origin.originX, window.innerWidth - origin.originX);
  const farthestY = Math.max(origin.originY, window.innerHeight - origin.originY);
  const radius = Math.ceil(Math.hypot(farthestX, farthestY));

  document.documentElement.style.setProperty("--theme-ripple-x", `${origin.originX}px`);
  document.documentElement.style.setProperty("--theme-ripple-y", `${origin.originY}px`);

  const transition = doc.startViewTransition(updateTheme);

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${origin.originX}px ${origin.originY}px)`,
          `circle(0px at ${origin.originX}px ${origin.originY}px)`,
          `circle(${radius}px at ${origin.originX}px ${origin.originY}px)`,
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
  });
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common.theme");
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function handleToggleTheme(event: MouseEvent<HTMLButtonElement>) {
    const targetTheme = isDark ? "light" : "dark";
    runThemeTransition(getEventOrigin(event), () => {
      document.documentElement.classList.toggle("dark", targetTheme === "dark");
      try {
        localStorage.setItem(STORAGE_KEY, targetTheme);
      } catch {
        // Storage can be disabled in private windows.
      }
      setIsDark(targetTheme === "dark");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleToggleTheme}
      className={className}
      aria-label={isDark ? t("switchLight") : t("switchDark")}
      aria-pressed={mounted ? isDark : undefined}
      suppressHydrationWarning
    >
      <AnimatePresence mode="wait" initial={false}>
        {mounted && isDark ? (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <MoonIcon />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <SunIcon />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
