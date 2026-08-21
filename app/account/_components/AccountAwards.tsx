"use client";

import { useEffect, useState } from "react";
import { TrophyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import QuickTooltip from "@/components/ui/quick-tooltip";
import {
  compareRecognitionBadgeKeys,
  isRecognitionBadgeKey,
  parseRecognitionBadgeKey,
} from "@/app/_lib/recognition-badges";
import { fetchRecognitionBadgesForDid } from "@/app/_lib/indexer";
import { bioblitzRoundUsesPoints } from "@/lib/bioblitz-prizes";
import { recognitionBadgeIcon } from "./RecognitionBadges";

type Translator = (key: string, values?: Record<string, string | number>) => string;

/** Translated display label for one recognition badge key, round included. */
function awardLabelFor(key: string, t: Translator): string {
  const parsed = parseRecognitionBadgeKey(key);
  if (parsed?.family === "manual") return t(`badges.${parsed.key}.label`);
  if (parsed?.family === "bioblitz") {
    // The board prize was renamed when the points era began; each badge keeps
    // the name of the rule its round was actually played under.
    const pointsEra =
      parsed.prize === "most-images" && parsed.roundId !== null && bioblitzRoundUsesPoints(parsed.roundId);
    const base = pointsEra ? "badges.bioblitz-most-images-points" : `badges.bioblitz-${parsed.prize}`;
    if (parsed.roundId === null) return t(`${base}.label`);
    const roundName =
      parsed.roundId === 1
        ? t("roundName.pilot")
        : t("roundName.numbered", { round: parsed.roundId });
    return t(`${base}.labelWithRound`, { roundName });
  }
  return key;
}

const EMBLEM_SIZES = {
  /** Compact strip for dense rows (e.g. the BioBlitz leaderboard). */
  sm: {
    emblem: "h-5 w-5",
    icon: "size-3",
    dot: "-bottom-0.5 -end-0.5 px-[3px] text-[7px] leading-[9px]",
  },
  /** Profile hero size, matching the Trusted-by emblems. */
  md: {
    emblem: "h-8 w-8",
    icon: "size-4",
    dot: "-bottom-0.5 -end-0.5 px-1 text-[9px] leading-3",
  },
} as const;

type AwardEmblemGroup = {
  key: string;
  badges: string[];
  isBioblitz: boolean;
};

/**
 * Group the individual recognition records into the emblems shown in compact
 * account and leaderboard rows. BioBlitz wins share one emblem; the count is
 * the number of winning badges, not the number of unique rounds.
 */
export function groupAwardKeys(keys: Iterable<string>): AwardEmblemGroup[] {
  const groups: AwardEmblemGroup[] = [];
  const bioblitzBadges: string[] = [];

  for (const key of displayAwardKeys(keys)) {
    const parsed = parseRecognitionBadgeKey(key);
    if (parsed?.family === "bioblitz") {
      bioblitzBadges.push(key);
    } else {
      groups.push({ key, badges: [key], isBioblitz: false });
    }
  }

  if (bioblitzBadges.length > 0) {
    groups.push({ key: "bioblitz-wins", badges: bioblitzBadges, isBioblitz: true });
  }

  return groups;
}

function awardTooltipFor(group: AwardEmblemGroup, t: Translator) {
  const labels = group.badges.map((key) => awardLabelFor(key, t));
  if (!group.isBioblitz || labels.length <= 1) return labels[0] ?? "";

  return (
    <span className="flex max-w-64 flex-col gap-1 text-start">
      <span className="font-semibold">{t("bioblitzWinsTooltip", { count: labels.length })}</span>
      {labels.map((label, index) => (
        <span key={`${group.badges[index]}-${index}`}>{label}</span>
      ))}
    </span>
  );
}

/**
 * Overlapping circular recognition emblems. Manual recognition badges keep
 * one emblem each; all BioBlitz winning badges share one trophy emblem with an
 * xN count when there is more than one. Every emblem has a tooltip with its
 * award details. Renders nothing when empty.
 */
export function AwardEmblems({
  badges,
  size = "md",
  className = "",
}: {
  badges: string[];
  size?: keyof typeof EMBLEM_SIZES;
  className?: string;
}) {
  const t = useTranslations("common.recognition");
  const groups = groupAwardKeys(badges);
  if (groups.length === 0) return null;
  const dims = EMBLEM_SIZES[size];

  return (
    // Slight padding so the overhanging count dot never gets clipped by a
    // parent with overflow-hidden.
    <span className={`inline-flex shrink-0 items-center -space-x-1 pb-0.5 pe-0.5 ${className}`}>
      {groups.map((group) => {
        const Icon = group.isBioblitz ? TrophyIcon : recognitionBadgeIcon(group.badges[0]);
        const count = group.badges.length;
        return (
          <QuickTooltip key={group.key} content={awardTooltipFor(group, t)} asChild>
            <span
              className={`relative grid ${dims.emblem} place-items-center rounded-full bg-background shadow-sm ring-1 ring-border/70 transition hover:z-10 hover:ring-2 hover:ring-primary`}
            >
              <Icon className={`${dims.icon} text-primary`} aria-hidden />
              {group.isBioblitz && count > 1 ? (
                <span
                  className={`absolute rounded-full bg-primary font-semibold tabular-nums text-primary-foreground ${dims.dot}`}
                >
                  {t("bioblitzCount", { count })}
                </span>
              ) : null}
            </span>
          </QuickTooltip>
        );
      })}
    </span>
  );
}

/** Filter + order a raw badge-key set for display (newest BioBlitz round first). */
export function displayAwardKeys(keys: Iterable<string>): string[] {
  return [...keys].filter(isRecognitionBadgeKey).sort(compareRecognitionBadgeKeys);
}

/**
 * Read-only "Awards" line for a public profile, styled to sit beside the
 * plain "Trusted by" line in the hero: a quiet label followed by compact
 * recognition emblems. Fetches its own data by DID (the same
 * self-contained pattern as TrustedByBadges) so both hero variants can drop
 * it in without plumbing. BioBlitz wins are grouped into one emblem by
 * AwardEmblems. Renders nothing while loading or when there are no awards.
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
        if (active) setBadges(displayAwardKeys(keys));
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

  const names = badges.map((key) => awardLabelFor(key, t)).join(", ");

  return (
    <span
      className={`flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground ${className}`}
      aria-label={t("aria", { names })}
    >
      <span className="shrink-0 whitespace-nowrap leading-none">{t("awardsLabel")}</span>
      <AwardEmblems badges={badges} size="md" />
    </span>
  );
}
