import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  PUBLIC_LOCALES,
  SUPPORTED_LOCALES,
  getLocaleDirection,
  isPublicLocale,
  isSupportedLanguageCode,
  resolvePreferredLanguageFromHeader,
  resolvePublicLanguage,
} from "./languages";
import { getSeoLocalizedPathnames } from "./routing";
import { mergeMessages } from "./merge-messages";
import { messagesByLocale } from "@/messages/locales";

function stringPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    stringPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("mergeMessages", () => {
  it("layers the override over the base without mutating either", () => {
    const base = { a: "base-a", nested: { b: "base-b", c: "base-c" } };
    const override = { nested: { b: "override-b" } };
    const merged = mergeMessages(base, override);

    expect(merged).toEqual({ a: "base-a", nested: { b: "override-b", c: "base-c" } });
    expect(base.nested.b).toBe("base-b");
    expect(override).toEqual({ nested: { b: "override-b" } });
  });

  it("replaces arrays wholesale rather than splicing them together", () => {
    const merged = mergeMessages({ items: ["one", "two", "three"] }, { items: ["١"] });
    expect(merged.items).toEqual(["١"]);
  });

  it("keeps override-only keys", () => {
    expect(mergeMessages({ a: "a" }, { b: "b" })).toEqual({ a: "a", b: "b" });
  });
});

describe("Arabic locale registration", () => {
  it("is routable", () => {
    expect(SUPPORTED_LOCALES).toContain("ar");
    expect(isSupportedLanguageCode("ar")).toBe(true);
  });

  it("is not advertised publicly while its translation is partial", () => {
    expect(PUBLIC_LOCALES).not.toContain("ar");
    expect(isPublicLocale("ar")).toBe(false);
  });

  it("is kept out of hreflang/sitemap alternates", () => {
    expect(Object.keys(getSeoLocalizedPathnames("/status"))).not.toContain("ar");
  });

  it("still resolves from an Accept-Language header", () => {
    expect(resolvePreferredLanguageFromHeader("ar-EG,ar;q=0.9,en;q=0.8")).toBe("ar");
  });
});

describe("text direction", () => {
  it("marks Arabic right-to-left and everything else left-to-right", () => {
    expect(getLocaleDirection("ar")).toBe("rtl");
    for (const locale of PUBLIC_LOCALES) expect(getLocaleDirection(locale)).toBe("ltr");
  });
});

describe("resolvePublicLanguage", () => {
  it("falls back to English for a partially translated locale", () => {
    expect(resolvePublicLanguage("ar")).toBe(DEFAULT_LANGUAGE);
  });

  it("passes fully translated locales through untouched", () => {
    for (const locale of PUBLIC_LOCALES) expect(resolvePublicLanguage(locale)).toBe(locale);
  });
});

describe("Arabic message catalog", () => {
  const englishKeys = stringPaths(messagesByLocale.en);
  const arabicKeys = new Set(stringPaths(messagesByLocale.ar));

  it("resolves every English key so no lookup can throw", () => {
    expect(englishKeys.length).toBeGreaterThan(0);
    expect(englishKeys.filter((key) => !arabicKeys.has(key))).toEqual([]);
  });

  it("introduces no keys that English lacks", () => {
    const english = new Set(englishKeys);
    expect([...arabicKeys].filter((key) => !english.has(key))).toEqual([]);
  });

  it("actually serves Arabic for the translated shell namespaces", () => {
    const { common } = messagesByLocale.ar as { common: Record<string, never> };
    const arabicScript = /[\u0600-\u06FF]/;
    expect(arabicScript.test(String((common as never)["navigation"]["closeMenu"]))).toBe(true);
    expect(arabicScript.test(String((common as never)["footer"]["tagline"]))).toBe(true);
  });

  it("keeps the untranslated remainder on the English fallback", () => {
    const en = messagesByLocale.en as Record<string, never>;
    const ar = messagesByLocale.ar as Record<string, never>;
    expect(ar["upload"]).toEqual(en["upload"]);
  });
});
