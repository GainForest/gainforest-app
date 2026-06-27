"use client";

import { CheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_COOKIE_NAME,
  SUPPORTED_LANGUAGES,
  isSupportedLanguageCode,
  resolveSupportedLanguage,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";
import { withLocalePrefix } from "@/lib/i18n/routing";

function persistLocale(locale: SupportedLanguageCode) {
  const maxAge = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  document.documentElement.lang = locale;
}

/**
 * Inline language picker styled to sit inside the account dropdown menu —
 * a small section label plus one selectable row per supported language, with
 * a check on the active one. Replaces the standalone header LanguageSelector
 * for signed-in users so the language control lives next to Settings.
 */
export function AccountMenuLanguageOptions({ onSelect }: { onSelect?: () => void }) {
  const locale = resolveSupportedLanguage(useLocale());
  const pathname = usePathname();
  const t = useTranslations("common.language");

  return (
    <div role="group" aria-label={t("label")}>
      <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t("label")}
      </div>
      {SUPPORTED_LANGUAGES.map((option) => {
        const active = option.code === locale;
        return (
          <button
            key={option.code}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => {
              onSelect?.();
              if (!active && isSupportedLanguageCode(option.code)) {
                persistLocale(option.code);
                window.location.href = withLocalePrefix(pathname, option.code);
              }
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60",
            )}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {active ? <CheckIcon className="h-3.5 w-3.5 text-primary" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {option.nativeLabel}
              <span className="ml-1.5 text-xs text-muted-foreground">{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
