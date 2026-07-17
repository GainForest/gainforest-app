"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QuickTooltip from "@/components/ui/quick-tooltip";
import {
  compareRecognitionBadgeKeys,
  isRecognitionBadgeKey,
  parseRecognitionBadgeKey,
} from "@/app/_lib/recognition-badges";
import { fetchRecognitionBadgesForDid } from "@/app/_lib/indexer";
import { recognitionBadgeIcon } from "./RecognitionBadges";

/**
 * Read-only "Awards" line for a public profile, styled to sit beside the
 * plain "Trusted by" line in the hero: a quiet label followed by overlapping
 * round emblems, one per award. Fetches its own data by DID (the same
 * self-contained pattern as TrustedByBadges) so both hero variants can drop
 * it in without plumbing. A profile can hold several BioBlitz wins at once,
 * so BioBlitz emblems carry a small round number and a tooltip naming the
 * round and prize. Renders nothing while loading or when there are no awards.
 */
export function AccountAwards({ did, className = "" }: { did: string; className?: string }) {
  const t = useTranslations("common.recognition");
  const [badges, setBadges] = useState<string[]>([]);

  useEffect(() => {
    setBadges([]);
    if (!did.startsWith("did:")) return;

    let active = true;
    const controller = new AbortController();
    fetchRecognitionBadgesForDid(did, controller.signal)
      .then((keys) => {
        if (active) {
          setBadges([...keys].filter(isRecognitionBadgeKey).sort(compareRecognitionBadgeKeys));
        }
      })
      .catch(() => {
        if (active) setBadges([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [did]);

  if (badges.length === 0) return null;

  const labelFor = (key: string): string => {
    const parsed = parseRecognitionBadgeKey(key);
    if (parsed?.family === "manual") return t(`badges.${parsed.key}.label`);
    if (parsed?.family === "bioblitz") {
      const base = `badges.bioblitz-${parsed.prize}`;
      if (parsed.roundId === null) return t(`${base}.label`);
      const roundName =
        parsed.roundId === 1
          ? t("roundName.pilot")
          : t("roundName.numbered", { round: parsed.roundId });
      return t(`${base}.labelWithRound`, { roundName });
    }
    return key;
  };

  const names = badges.map(labelFor).join(", ");

  return (
    <span
      className={`flex min-w-0 items-center gap-2 overflow-hidden text-sm font-medium text-muted-foreground ${className}`}
      aria-label={t("aria", { names })}
    >
      <span className="shrink-0 whitespace-nowrap leading-none">{t("awardsLabel")}</span>
      <span className="inline-flex shrink-0 items-center -space-x-1">
        {badges.map((key) => {
          const Icon = recognitionBadgeIcon(key);
          const parsed = parseRecognitionBadgeKey(key);
          const roundId = parsed?.family === "bioblitz" ? parsed.roundId : null;
          return (
            <QuickTooltip key={key} content={labelFor(key)} asChild>
              <span className="relative grid h-8 w-8 place-items-center rounded-full bg-background shadow-sm ring-1 ring-border/70 transition hover:z-10 hover:ring-2 hover:ring-primary">
                <Icon className="size-4 text-primary" aria-hidden />
                {roundId !== null ? (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-primary px-1 text-[9px] font-semibold leading-3 tabular-nums text-primary-foreground">
                    {roundId}
                  </span>
                ) : null}
              </span>
            </QuickTooltip>
          );
        })}
      </span>
    </span>
  );
}
