"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_LABELS, type Locale } from "../_lib/i18n";
import { useLocale } from "./LocaleProvider";

// Elegant language picker that lives in the top navbar.
//
// Closed state: a slim pill showing the active locale's 2-letter code
// (e.g. "EN") with a chevron — same visual weight as the rest of the
// navbar so it doesn't distract.
//
// Open state: a small popover beneath the pill listing all five
// languages by their native name (English, Español, Português,
// Kiswahili, Bahasa Indonesia). Selecting one closes the popover and
// re-renders the page in that language; the choice persists in
// localStorage via the LocaleProvider.

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    (next: Locale) => {
      setLocale(next);
      setOpen(false);
    },
    [setLocale],
  );

  // Click-outside / escape closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = LOCALE_LABELS[locale];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.english}`}
        className={
          "inline-flex h-9 items-center gap-1.5 rounded-full border " +
          "border-border-soft bg-background/60 px-3 text-[12px] " +
          "font-medium uppercase tracking-[0.1em] text-foreground/75 " +
          "transition-colors hover:border-primary/40 hover:text-foreground"
        }
      >
        <GlobeGlyph />
        <span>{current.short}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose language"
          className={
            "absolute right-0 top-[calc(100%+8px)] z-50 w-[200px] " +
            "overflow-hidden rounded-[12px] border border-border-soft " +
            "bg-background/97 shadow-[0_18px_40px_-20px_rgba(40,50,30,0.35)] " +
            "backdrop-blur-sm"
          }
        >
          <ul className="py-1.5">
            {LOCALES.map((code) => {
              const meta = LOCALE_LABELS[code];
              const active = code === locale;
              return (
                <li key={code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(code)}
                    className={
                      "flex w-full items-center justify-between gap-3 " +
                      "px-3.5 py-2 text-left text-[13px] transition-colors " +
                      (active
                        ? "bg-primary/8 text-primary"
                        : "text-foreground/85 hover:bg-foreground/[0.04] hover:text-foreground")
                    }
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-garamond text-[15px]">
                        {meta.native}
                      </span>
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-foreground/45">
                      {meta.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function GlobeGlyph() {
  // Stylised globe icon — silhouette matches the rest of the icon set
  // (uniform 1.6 stroke, no outer ring).
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-foreground/55"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 12h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 3c2.5 3 3.8 6 3.8 9s-1.3 6-3.8 9c-2.5-3-3.8-6-3.8-9s1.3-6 3.8-9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
