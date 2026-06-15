"use client";

import { Globe2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LANGUAGE_COOKIE_NAME,
  SUPPORTED_LANGUAGES,
  getLanguageLabel,
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

export function LanguageSelector() {
  const locale = resolveSupportedLanguage(useLocale());
  const pathname = usePathname();
  const t = useTranslations("common.language");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg px-2 text-muted-foreground hover:text-foreground"
          aria-label={`${t("changeAria")}. ${t("currentLanguage")}: ${getLanguageLabel(locale)}`}
        >
          <Globe2Icon aria-hidden="true" />
          <span className="text-xs font-semibold uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (isSupportedLanguageCode(value)) {
              persistLocale(value);
              window.location.href = withLocalePrefix(pathname, value);
            }
          }}
        >
          {SUPPORTED_LANGUAGES.map((option) => (
            <DropdownMenuRadioItem key={option.code} value={option.code}>
              <span className="flex flex-col">
                <span>{option.nativeLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {option.label}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
