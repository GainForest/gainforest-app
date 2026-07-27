"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import type { AccountRouteData } from "../_lib/account-route";
import { accountHeroPresentation } from "./account-hero-layout";

/**
 * Keeps the full profile hero on Overview while secondary tabs start with a
 * compact identity bar. The full production hero remains available in place
 * through an explicit disclosure.
 */
export function AccountHeroDisclosure({
  account,
  children,
}: {
  account: AccountRouteData;
  children: React.ReactNode;
}) {
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");

  if (accountHeroPresentation(pathname, account.urlIdentifier) === "full") return <>{children}</>;

  return (
    <CompactAccountHero key={pathname} account={account}>
      {children}
    </CompactAccountHero>
  );
}

function CompactAccountHero({
  account,
  children,
}: {
  account: AccountRouteData;
  children: React.ReactNode;
}) {
  const t = useTranslations("common.accountHero");
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const initial = account.displayName.charAt(0).toUpperCase();
  const NameElement = expanded ? "p" : "h1";

  return (
    <>
      <section className="rounded-2xl bg-muted/60 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-background ring-1 ring-border/60">
            {account.avatarUrl ? (
              <Image
                src={account.avatarUrl}
                alt=""
                fill
                unoptimized
                sizes="44px"
                className="object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-sm font-semibold text-muted-foreground">
                {initial}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <NameElement className="truncate font-instrument text-xl font-light italic leading-tight text-foreground">
              {account.displayName}
            </NameElement>
            {account.description ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {account.description}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 rounded-full px-3"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((open) => !open)}
          >
            <span>{expanded ? t("hideProfile") : t("showProfile")}</span>
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-4 transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
          </Button>
        </div>
      </section>

      {expanded ? (
        <div id={contentId} className="mt-3">
          {children}
        </div>
      ) : null}
    </>
  );
}
