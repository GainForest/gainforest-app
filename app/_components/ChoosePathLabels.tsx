"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

// Small client island that supplies the translatable strings inside the
// otherwise server-rendered <ChoosePath /> section. Splitting it out
// keeps the section's <GlobeCard> as an async server component (which
// fetches live pins) without forcing the whole section to be client.
export function ChoosePathLabels({
  slot,
  href,
}: {
  slot: "heading" | "globe" | "bumicerts" | "or" | "allProjects";
  href?: string;
}) {
  const t = useT();

  if (slot === "heading") {
    return (
      <h2 className="text-center font-garamond text-[22px] font-normal text-foreground">
        {t("choosePath.heading")}
      </h2>
    );
  }
  if (slot === "or") {
    return (
      <div className="col-span-12 lg:col-span-1 text-center text-foreground/45 font-garamond italic">
        {t("choosePath.or")}
      </div>
    );
  }
  if (slot === "allProjects") {
    return (
      <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-foreground/45">
        {t("choosePath.allProjects")}
      </span>
    );
  }
  if (slot === "globe" || slot === "bumicerts") {
    const titleKey =
      slot === "globe" ? "choosePath.globe.title" : "choosePath.bumicerts.title";
    const bodyKey =
      slot === "globe" ? "choosePath.globe.body" : "choosePath.bumicerts.body";
    return (
      <div>
        <div className="font-garamond text-[22px] font-medium text-foreground">
          {t(titleKey)}
        </div>
        <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-foreground/65">
          {t(bodyKey)}
        </p>
        {href && (
          <Link
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-[13px] font-medium text-primary"
          >
            {t(titleKey)} <span>→</span>
          </Link>
        )}
      </div>
    );
  }
  return null;
}
