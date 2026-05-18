"use client";

import Link from "next/link";
import { LogoMark } from "./Logo";
import { SignInPopover } from "./SignInPopover";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useT } from "./LocaleProvider";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// Client-rendered view for the top navbar. The server wrapper
// (`TopNav.tsx`) resolves the OAuth session + handle and passes them in
// as serializable props. Translations and the language switcher live
// here so they can react to the active locale without a round-trip.
export function TopNavView({
  signedIn,
  handle,
}: {
  signedIn: boolean;
  handle: string | null;
}) {
  const t = useT();

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

  return (
    <header className="w-full border-b border-border-soft">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between px-12">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="GainForest — home"
        >
          <LogoMark className="h-7 w-7 text-primary" title="GainForest" />
          <span className="font-garamond text-[22px] font-semibold tracking-tight text-foreground">
            GainForest
          </span>
        </Link>

        <nav className="hidden items-center gap-10 md:flex">
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

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <SignInPopover signedIn={signedIn} handle={handle} />
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-[15px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
          >
            {t("nav.getStarted")}
          </Link>
        </div>
      </div>
    </header>
  );
}
