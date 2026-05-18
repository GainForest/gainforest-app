"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGES,
  asLocale,
  type Locale,
  type MessageKey,
} from "../_lib/i18n";

// Client-side locale state. The landing is mostly server-rendered in
// English; on hydration this provider reads the visitor's saved choice
// (or browser language) and pushes it through context, so every
// translated component re-renders with the right strings.
//
// Trade-off: a saved-non-English locale produces a brief flash of
// English before hydration. Acceptable for a marketing landing — proper
// locale routing (URL- or cookie-based) would round-trip the server.

const STORAGE_KEY = "gainforest.locale.v1";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey) => string;
  /** True only after the layout-effect resolved the initial locale. Lets
   *  components delay locale-dependent UI to avoid the English flash. */
  hydrated: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const langs = [
    ...(navigator.languages ?? []),
    navigator.language ?? "",
  ];
  for (const raw of langs) {
    const short = raw.toLowerCase().slice(0, 2);
    if ((LOCALES as readonly string[]).includes(short)) {
      return short as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  // useLayoutEffect runs before the browser paints — so the initial
  // locale resolves before the user sees the page. Still, the *server-
  // rendered* HTML is English, so a saved-non-English visitor sees a
  // brief flash of English on slow networks.
  useLayoutEffect(() => {
    let resolved: Locale | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) resolved = asLocale(raw);
    } catch {
      // ignore corrupt storage
    }
    if (!resolved) resolved = detectBrowserLocale();
    setLocaleState(resolved);
    setHydrated(true);
  }, []);

  // Reflect the active locale on <html lang=""> so screen-readers and
  // browser features (translate prompts, hyphenation) follow along.
  useEffect(() => {
    if (!hydrated) return;
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale, hydrated]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Surface the choice to /api/sim-chat too. The route reads this
      // cookie-style header off the request body when sending; the
      // cookie below is a belt-and-braces in case future code wants to
      // read it server-side.
      document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key],
      hydrated,
    }),
    [locale, setLocale, hydrated],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return ctx;
}

/** Sugar: just the translator function. */
export function useT(): (key: MessageKey) => string {
  return useLocale().t;
}
