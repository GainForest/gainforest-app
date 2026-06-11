"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MessageKey } from "../_lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { useT } from "./LocaleProvider";

// Route-aware top nav — a port of bumicerts-clean-rewrite's TopNav.
// The previous iteration mixed two behaviours in one pill rail: six
// hash anchors that scrolled the landing super-page and two real
// routes that navigated away. Identical-looking pills doing different
// things read as broken navigation, so the rail is now pages-only
// (real routes, `aria-current` active state from usePathname) and the
// landing's in-page anchors live in a clearly labelled secondary
// "On this page" group inside the mobile drawer, rendered only on `/`.

type PageItem = {
  href: "/" | `/${string}`;
  labelKey: MessageKey;
};

const PAGES: ReadonlyArray<PageItem> = [
  { href: "/", labelKey: "nav.home" },
  { href: "/explorer", labelKey: "nav.explorer" },
  { href: "/research", labelKey: "nav.research" },
  { href: "/about", labelKey: "nav.about" },
];

// Landing-only quick anchors. These never appear as primary pills —
// they render as a small secondary link group in the drawer when the
// visitor is already on the landing, where "jump down the page" is an
// honest description of what clicking does.
const LANDING_SECTIONS: ReadonlyArray<{
  href: `#${string}`;
  labelKey: MessageKey;
}> = [
  { href: "#tools", labelKey: "nav.tools" },
  { href: "#how-it-works", labelKey: "nav.howItWorks" },
  { href: "#data-commons", labelKey: "nav.data" },
  { href: "#ai", labelKey: "nav.ai" },
  { href: "#partners", labelKey: "nav.partners" },
  { href: "#impact", labelKey: "nav.impact" },
];

export function TopNavView() {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const onLanding = pathname === "/";

  // Home only matches exactly; other pages also match their subpaths
  // so e.g. a future /research/2026 still lights up "Research".
  const isActive = (href: string) =>
    href === "/" ? onLanding : pathname === href || pathname.startsWith(`${href}/`);

  // Close the mobile drawer on route change (bumicerts pattern).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Esc closes the drawer; body scroll locks while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-[70] w-full border-b border-border-soft/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between gap-3 px-5 sm:px-8 lg:h-[68px] lg:px-12 xl:px-16">
          {/* Logo: on the landing it scrolls back to top (`#top`);
              from any other route it navigates home. */}
          <Link
            href={onLanding ? "#top" : "/"}
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
            aria-label="GainForest"
            onClick={() => setMenuOpen(false)}
          >
            <LogoMark
              className="h-6 w-6 text-brand lg:h-7 lg:w-7"
              title="GainForest"
            />
            <span className="font-garamond text-[20px] font-semibold tracking-tight text-foreground lg:text-[22px]">
              GainForest
            </span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 rounded-full border border-border-soft bg-background/70 p-1 lg:flex"
            aria-label={t("nav.pages")}
          >
            {PAGES.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-[13px] font-medium leading-none transition-colors xl:px-4 ${
                  isActive(item.href)
                    ? "bg-foreground/[0.06] text-foreground"
                    : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t("nav.closeMenu") : t("nav.menu")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-foreground/75 transition-colors hover:border-foreground/35 hover:text-foreground lg:hidden"
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 z-[60] lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[1px]" />
          <nav
            onClick={(e) => e.stopPropagation()}
            className="relative border-b border-border-soft bg-background/95 px-5 pb-6 pt-4 shadow-[0_18px_60px_-36px_rgba(40,50,30,0.35)] animate-[drawerIn_180ms_ease-out] sm:px-8"
            aria-label={t("nav.pages")}
          >
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
              {t("nav.pages")}
            </p>
            <div className="grid gap-1">
              {PAGES.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`group flex items-center justify-between border-b border-border-soft/80 py-3.5 font-garamond text-[25px] font-normal leading-none transition-colors last:border-b-0 ${
                    isActive(item.href)
                      ? "text-primary"
                      : "text-foreground hover:text-primary"
                  }`}
                >
                  <span>{t(item.labelKey)}</span>
                  <span
                    aria-hidden
                    className="text-[18px] text-foreground/35 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>

            {/* Secondary in-page anchors, landing only. Hash links keep
                the pathname at `/` so the route-change effect never
                fires for them — the explicit onClick close is load-
                bearing here. */}
            {onLanding && (
              <>
                <p className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                  {t("nav.onThisPage")}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-[13px] text-foreground/60">
                  {LANDING_SECTIONS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="transition-colors hover:text-primary"
                    >
                      {t(item.labelKey)}
                    </a>
                  ))}
                </div>
              </>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
