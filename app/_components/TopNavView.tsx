"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";
import { SignInPopover } from "./SignInPopover";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useT } from "./LocaleProvider";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// Client-rendered view for the top navbar. The server wrapper
// (`TopNav.tsx`) resolves the OAuth session + handle and passes them in
// as serializable props. Translations, the language switcher, and a
// mobile drawer menu live here so they react to the active locale
// without a server round-trip.
export function TopNavView({
  signedIn,
  handle,
}: {
  signedIn: boolean;
  handle: string | null;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);

  const items: ReadonlyArray<{ key: string; label: string; href: string }> = [
    { key: "globe", label: t("nav.globe"), href: GLOBE_URL },
    // "Bumicerts" is the product name — kept untranslated on purpose.
    { key: "bumicerts", label: "Bumicerts", href: `${BUMICERTS_URL}/explore` },
    {
      key: "forCommunities",
      label: t("nav.forCommunities"),
      href: `${BUMICERTS_URL}/organizations`,
    },
    {
      key: "forSupporters",
      label: t("nav.forSupporters"),
      href: `${BUMICERTS_URL}/leaderboard`,
    },
    {
      key: "about",
      label: t("nav.about"),
      href: "https://www.gainforest.earth",
    },
  ];

  // Esc closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Lock body scroll while the drawer is open.
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
      <header className="w-full border-b border-border-soft">
        <div className="mx-auto flex h-[64px] w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:h-[68px] lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="GainForest — home"
          >
            <LogoMark
              className="h-6 w-6 lg:h-7 lg:w-7 text-primary"
              title="GainForest"
            />
            <span className="font-garamond text-[20px] lg:text-[22px] font-semibold tracking-tight text-foreground">
              GainForest
            </span>
          </Link>

          {/* Desktop / tablet links */}
          <nav className="hidden items-center gap-8 xl:gap-10 lg:flex">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="text-[15px] font-normal text-foreground/85 transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <div className="hidden sm:block">
              <SignInPopover signedIn={signedIn} handle={handle} />
            </div>
            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex h-10 lg:h-11 items-center justify-center rounded-md bg-primary px-4 lg:px-5 text-[14px] lg:text-[15px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
            >
              {t("nav.getStarted")}
            </Link>

            {/* Mobile hamburger — only visible below lg */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={t("nav.about")}
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-soft text-foreground/75 transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[80] lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          {/* backdrop */}
          <div className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]" />

          <nav
            onClick={(e) => e.stopPropagation()}
            className={
              "absolute right-0 top-0 flex h-full w-[280px] max-w-[88vw] " +
              "flex-col gap-1 overflow-y-auto border-l border-border-soft " +
              "bg-background px-4 pb-6 pt-5 shadow-[0_0_60px_-20px_rgba(40,50,30,0.4)] " +
              "animate-[drawerIn_180ms_ease-out]"
            }
            aria-label="Mobile menu"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogoMark className="h-5 w-5 text-primary" title="GainForest" />
                <span className="font-garamond text-[18px] font-semibold text-foreground">
                  GainForest
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <CloseIcon />
              </button>
            </div>

            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-2.5 py-2.5 font-garamond text-[18px] text-foreground/85 transition-colors hover:bg-foreground/[0.04] hover:text-primary"
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-3 border-t border-border-soft pt-4">
              <SignInPopover signedIn={signedIn} handle={handle} />
            </div>

            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="mt-3 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-[14px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
            >
              {t("nav.getStarted")}
            </Link>
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
