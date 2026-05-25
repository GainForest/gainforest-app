"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MessageKey } from "../_lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

// Resolve a NavItem's href against the current pathname. Hash anchors
// scroll on the landing; from any other route (e.g. /about) they
// route back to `/` with the hash so the browser scrolls to the
// right landing section after navigation. Real routes pass through.
function resolveHref(href: string, pathname: string): string {
  if (href.startsWith("#")) {
    return pathname === "/" ? href : `/${href}`;
  }
  return href;
}

type NavItem = {
  key: string;
  labelKey: MessageKey;
  /** Either an in-page hash anchor (landing sections) or a real route
   *  (`/about`). The renderer treats both equivalently — hash anchors
   *  scroll on the landing and navigate to `/#section` from other
   *  routes, real routes route normally. */
  href: `#${string}` | `/${string}`;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "tools", labelKey: "nav.tools", href: "#tools" },
  { key: "how", labelKey: "nav.howItWorks", href: "#how-it-works" },
  { key: "data", labelKey: "nav.data", href: "#data-commons" },
  { key: "ai", labelKey: "nav.ai", href: "#ai" },
  { key: "partners", labelKey: "nav.partners", href: "#partners" },
  { key: "impact", labelKey: "nav.impact", href: "#impact" },
  // Standalone routes — live at /about, /research, /explorer, not
  // landing sections. Their i18n keys already exist in i18n.ts
  // (nav.about, nav.research, nav.explorer).
  { key: "explorer", labelKey: "nav.explorer", href: "/explorer" },
  { key: "about", labelKey: "nav.about", href: "/about" },
  { key: "research", labelKey: "nav.research", href: "/research" },
];

// Client-rendered view for the top navbar. It stays deliberately local:
// every visible nav link is a hash anchor into this landing page, while
// product, donate, and auth actions live in the body / footer instead
// of competing with the editorial section rail.
export function TopNavView() {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  // Esc closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Lock body scroll while the mobile section menu is open.
  useEffect(() => {
    if (!menuOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-[70] w-full border-b border-border-soft/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-8 lg:h-[68px] lg:px-16">
          {/* Logo: from the landing, scroll back to top; from any
              other route (e.g. /about), navigate home. Without the
              `resolveHref` call this rendered `/about#top` and the
              browser just scrolled the about page back up instead
              of taking the visitor home. */}
          <Link
            href={resolveHref("#top", pathname)}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
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
            className="hidden items-center gap-1 rounded-full border border-border-soft bg-background/70 p-1 lg:flex"
            aria-label={t("nav.sections")}
          >
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href.startsWith("/") && pathname === item.href;
              return (
                <Link
                  key={item.key}
                  href={resolveHref(item.href, pathname)}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full px-3.5 py-2 text-[13px] font-medium leading-none transition-colors xl:px-4 ${
                    isActive
                      ? "bg-foreground/[0.06] text-foreground"
                      : "text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground"
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
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
            aria-label={t("nav.sections")}
          >
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
              {t("nav.sections")}
            </p>
            <div className="grid gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={resolveHref(item.href, pathname)}
                  onClick={() => setMenuOpen(false)}
                  className="group flex items-center justify-between border-b border-border-soft/80 py-3.5 font-garamond text-[25px] font-normal leading-none text-foreground transition-colors last:border-b-0 hover:text-primary"
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
          </nav>
        </div>
      )}
    </>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
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
