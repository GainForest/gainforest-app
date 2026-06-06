"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { cn } from "@/lib/utils";

export type BumicertsBumicertCardRecord = {
  did: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
  locationCount: number;
  contributorCount: number;
  startDate: string | null;
  endDate: string | null;
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
  const objectives = buildObjectiveLabels(record);
  const organizationName = "Project steward";
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
          <h3 className="relative z-1 line-clamp-1 font-instrument text-2xl italic leading-snug text-foreground">
            {record.title}
          </h3>
          {record.shortDescription ? (
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {record.shortDescription}
            </p>
          ) : null}
        </div>

        {objectives.length > 0 ? (
          <div className="mt-4 flex w-full flex-wrap items-center gap-2">
            {objectives.map((objective) => (
              <span
                key={objective}
                className={cn(
                  "rounded-full bg-muted px-2.5 py-1 text-sm font-medium",
                  objective.startsWith("+") ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {objective}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="absolute left-2 top-2 flex min-w-0 items-center gap-1 rounded-full bg-background/70 p-1 shadow-lg backdrop-blur-lg">
        <div className="relative h-6 w-6 shrink-0 scale-120 overflow-hidden rounded-full bg-white shadow-sm transition-all duration-300 group-hover:scale-100">
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-[8px] font-bold text-muted-foreground">
            {organizationName.charAt(0).toUpperCase()}
          </div>
        </div>
        <motion.span
          variants={orgLabelTextVariants}
          className="overflow-hidden whitespace-nowrap text-xs font-medium text-foreground text-shadow-md"
        >
          {organizationName}
        </motion.span>
      </div>
    </motion.div>
  );
}

function buildObjectiveLabels(record: BumicertsBumicertCardRecord): string[] {
  const labels: string[] = [];
  if (record.locationCount > 0) labels.push(`${record.locationCount} ${record.locationCount === 1 ? "place" : "places"}`);
  if (record.contributorCount > 0) labels.push(`${record.contributorCount} ${record.contributorCount === 1 ? "contributor" : "contributors"}`);
  if (record.startDate || record.endDate) labels.push("project dates");
  return [labels[0], labels.length > 1 ? `+${labels.length - 1}` : null].filter((value): value is string => Boolean(value));
}
