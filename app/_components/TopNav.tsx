"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";
import { StatusPill } from "./StatusPill";
import type { StatusSnapshot } from "../_lib/status";
import { BUMICERTS_URL, GLOBE_URL } from "../_lib/urls";

const SECTIONS = [
  { href: "#explore", label: "Explore" },
  { href: "#dashboard", label: "Donations" },
  { href: "#status", label: "Status" },
] as const;

// Minimal, explorer-local header. Logo + in-page section anchors + a live
// status pill, with outbound links to the two production apps tucked into the
// mobile drawer. Sticky + blurred over the cream background, matching
// gainforest-app's TopNav rhythm.
export function TopNav({ status }: { status: StatusSnapshot }) {
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-8 lg:h-[68px] lg:px-16">
          <Link
            href="#top"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            aria-label="GainForest Explorer"
            onClick={() => setMenuOpen(false)}
          >
            <LogoMark className="h-6 w-6 text-brand lg:h-7 lg:w-7" title="GainForest" />
            <span className="font-garamond text-[20px] font-semibold tracking-tight text-foreground lg:text-[22px]">
              GainForest
            </span>
            <span className="hidden rounded-full border border-border-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/55 sm:inline-block">
              Explorer
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 rounded-full border border-border-soft bg-background/70 p-1 lg:flex"
            aria-label="Sections"
          >
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="rounded-full px-4 py-2 text-[13px] font-medium leading-none text-foreground/65 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              >
                {s.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline-flex">
              <StatusPill snapshot={status} />
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
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
            aria-label="Sections"
          >
            <div className="mb-3 sm:hidden">
              <StatusPill snapshot={status} />
            </div>
            <div className="grid gap-1">
              {SECTIONS.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setMenuOpen(false)}
                  className="group flex items-center justify-between border-b border-border-soft/80 py-3.5 font-garamond text-[24px] font-normal leading-none text-foreground transition-colors last:border-b-0 hover:text-primary"
                >
                  <span>{s.label}</span>
                  <span aria-hidden className="text-foreground/35 transition-transform group-hover:translate-x-1 group-hover:text-primary">
                    →
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-foreground/60">
              <Link href={GLOBE_URL} target="_blank" rel="noreferrer" className="hover:text-primary">
                Green Globe ↗
              </Link>
              <Link href={`${BUMICERTS_URL}/explore`} target="_blank" rel="noreferrer" className="hover:text-primary">
                Bumicerts ↗
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
