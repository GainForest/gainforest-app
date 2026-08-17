"use client";

/**
 * Public | Your recordings — the two audiences of the Audio hub, shown as a
 * pill pair in the hero. "Public" is the network-wide soundscape gallery
 * (the bare /observations/audio URL); "Your recordings" jumps into the
 * personal recording workflow, library first. Rendered on both sides of the
 * split so the toggle reads the same wherever you stand.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function AudioScopePills({ active }: { active: "public" | "yours" }) {
  const t = useTranslations("common.audiomoth.audioHub");

  const pillClass = (isActive: boolean) =>
    cn(
      "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
      isActive
        ? "border-transparent bg-primary text-primary-foreground shadow-sm"
        : "border-border bg-card/70 text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/observations/audio"
        aria-current={active === "public" ? "page" : undefined}
        className={pillClass(active === "public")}
      >
        {t("publicPill")}
      </Link>
      <Link
        href="/observations/audio?tab=library"
        aria-current={active === "yours" ? "page" : undefined}
        className={pillClass(active === "yours")}
      >
        {t("yourRecordings")}
      </Link>
    </div>
  );
}
