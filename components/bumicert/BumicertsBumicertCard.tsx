"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDaysIcon, MapPinIcon, UsersIcon } from "lucide-react";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { cn } from "@/lib/utils";
import { BumicertOwnerAvatar } from "./BumicertOwnerAvatar";
import { BumicertPillRows, type BumicertCardPill } from "./BumicertPillRows";
import {
  formatWorkScopeTag,
  type WorkScopeLabels,
} from "@/app/_lib/work-scope-labels";

export type BumicertsBumicertCardRecord = {
  did: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
  locationCount: number;
  contributorCount: number;
  scopeTags?: string[];
  startDate: string | null;
  endDate: string | null;
  creatorName?: string | null;
  creatorAvatarRef?: string | null;
};

export function BumicertsBumicertCard({
  record,
  priority = false,
  className,
}: {
  record: BumicertsBumicertCardRecord;
  priority?: boolean;
  className?: string;
}) {
  const workScopeT = useTranslations("common.workScopes");
  const t = useTranslations("bumicert.detail.recovery.card");
  const locale = useLocale();
  const workScopeLabels: WorkScopeLabels = {
    reforestation: workScopeT("reforestation"),
    forest_protection: workScopeT("forestProtection"),
    biodiversity_monitoring: workScopeT("natureMonitoring"),
    community_stewardship: workScopeT("communityStewardship"),
    carbon_removal: workScopeT("carbonRemoval"),
    restoration_maintenance: workScopeT("restorationMaintenance"),
  };
  const { scopeItems, iconItems } = buildPillRows(
    record,
    workScopeLabels,
    t,
    locale,
  );
  const organizationName = record.creatorName ?? t("projectSteward");
  const hasImage = Boolean(record.imageUrl);

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden bg-muted/30 transition-colors motion-reduce:transition-none",
        className,
      )}
    >
      <div className="relative z-0 aspect-[4/3] overflow-hidden bg-muted">
        {hasImage ? (
          <Image
            src={record.imageUrl!}
            alt={record.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 320px"
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={!isPdsBlobUrl(record.imageUrl)}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="absolute inset-0 bg-muted"
            aria-label={t("missingImage")}
          />
        )}
      </div>

      <div className="relative z-1 -mt-6 flex flex-1 flex-col justify-between px-4 py-3">
        <div className="absolute -top-2 left-0 right-0 z-0 h-8 bg-linear-to-b from-transparent via-background/65 to-background" />
        <div>
          <h3 className="relative z-1 line-clamp-2 font-instrument text-2xl italic leading-snug text-foreground">
            {record.title}
          </h3>
          {record.shortDescription ? (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {record.shortDescription}
            </p>
          ) : null}
        </div>

        <BumicertPillRows scopeItems={scopeItems} iconItems={iconItems} />
      </div>

      <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] min-w-0 items-center gap-1 overflow-hidden rounded-full bg-background/70 p-1 shadow-lg backdrop-blur-lg">
        <BumicertOwnerAvatar
          did={record.did}
          avatarRef={record.creatorAvatarRef}
          label={organizationName}
          className="h-6 w-6 shrink-0 scale-120 shadow-sm transition-all duration-300 group-hover:scale-100"
        />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-xs font-medium text-foreground">
          {organizationName}
        </span>
      </div>
    </div>
  );
}

function buildPillRows(
  record: BumicertsBumicertCardRecord,
  workScopeLabels: WorkScopeLabels,
  t: ReturnType<typeof useTranslations>,
  locale: string,
): {
  scopeItems: BumicertCardPill[];
  iconItems: BumicertCardPill[];
} {
  const scopeItems: BumicertCardPill[] = (record.scopeTags ?? []).map(
    (tag, index) => ({
      key: `scope-${index}-${tag}`,
      content: <span>{formatWorkScopeTag(tag, workScopeLabels)}</span>,
    }),
  );

  const iconItems: BumicertCardPill[] = [];

  if (record.locationCount > 0) {
    iconItems.push({
      key: "places",
      content: (
        <>
          <MapPinIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatCompactCount(record.locationCount, locale)}</span>
        </>
      ),
      ariaLabel: t("places", { count: record.locationCount }),
    });
  }

  if (record.contributorCount > 0) {
    iconItems.push({
      key: "contributors",
      content: (
        <>
          <UsersIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatCompactCount(record.contributorCount, locale)}</span>
        </>
      ),
      ariaLabel: t("contributors", { count: record.contributorCount }),
    });
  }

  if (record.startDate || record.endDate) {
    iconItems.push({
      key: "dates",
      content: <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden />,
      ariaLabel: t("dates"),
    });
  }

  return { scopeItems, iconItems };
}

function formatCompactCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}
