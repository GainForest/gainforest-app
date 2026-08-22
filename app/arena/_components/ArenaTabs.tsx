"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * The arena's three sub-pages as a pathname-driven tab bar — same underline
 * idiom as the account tab bar, but plain links so each tab is its own route.
 */
export function ArenaTabs() {
  const t = useTranslations("common.arena.tabs");
  // Locale prefixes live in the pathname; compare against the stripped path
  // so /en/arena and /pt/arena highlight identically.
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const tabs = [
    { href: "/arena", label: t("overview"), exact: true },
    { href: "/arena/identification", label: t("identification"), exact: false },
    { href: "/arena/image-review", label: t("imageReview"), exact: false },
  ];

  return (
    <nav aria-label={t("ariaLabel")} className="mt-4">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hidden">
        <div className="flex min-w-max items-end gap-1 border-b border-border">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors duration-150 select-none",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
