"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { CalendarDaysIcon, MapPinIcon, UsersIcon } from "lucide-react";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { cn } from "@/lib/utils";
import { BumicertOwnerAvatar } from "./BumicertOwnerAvatar";
import { BumicertPillRows, type BumicertCardPill } from "./BumicertPillRows";

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

const orgLabelTextVariants = {
  initial: {
    opacity: 0,
    maxWidth: 0,
    marginLeft: "-0.25rem",
    marginRight: "0rem",
    pointerEvents: "none" as const,
    x: -2,
    filter: "blur(4px)",
  },
  cardHover: {
    opacity: 1,
    maxWidth: 200,
    marginLeft: "0rem",
    marginRight: "0.5rem",
    pointerEvents: "auto" as const,
    x: 0,
    filter: "blur(0px)",
  },
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
  const { scopeItems, iconItems } = buildPillRows(record);
  const organizationName = record.creatorName ?? "Project steward";
  const hasImage = Boolean(record.imageUrl);

  return (
    <motion.div
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-lg",
        className,
      )}
      initial="initial"
      whileHover="cardHover"
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
            className="scale-110 object-cover transition-all duration-300 group-hover:scale-100"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" aria-label="Missing image" />
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
        <motion.span
          variants={orgLabelTextVariants}
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-foreground text-shadow-md"
        >
          {organizationName}
        </motion.span>
      </div>
    </motion.div>
  );
}

function buildPillRows(record: BumicertsBumicertCardRecord): {
  scopeItems: BumicertCardPill[];
  iconItems: BumicertCardPill[];
} {
  const scopeItems: BumicertCardPill[] = (record.scopeTags ?? []).map((tag, index) => ({
    key: `scope-${index}-${tag}`,
    content: <span>{formatScopeTag(tag)}</span>,
  }));

  const iconItems: BumicertCardPill[] = [];

  if (record.locationCount > 0) {
    iconItems.push({
      key: "places",
      content: (
        <>
          <MapPinIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatCompactCount(record.locationCount)}</span>
        </>
      ),
      ariaLabel: `${record.locationCount} project place${record.locationCount === 1 ? "" : "s"}`,
    });
  }

  if (record.contributorCount > 0) {
    iconItems.push({
      key: "contributors",
      content: (
        <>
          <UsersIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatCompactCount(record.contributorCount)}</span>
        </>
      ),
      ariaLabel: `${record.contributorCount} ${record.contributorCount === 1 ? "person" : "people"} named`,
    });
  }

  if (record.startDate || record.endDate) {
    iconItems.push({
      key: "dates",
      content: <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden />,
      ariaLabel: "Project dates added",
    });
  }

  return { scopeItems, iconItems };
}

function formatScopeTag(tag: string): string {
  const clean = tag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
}

function formatCompactCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
