"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { CalendarDaysIcon, MapPinIcon, UsersIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { cn } from "@/lib/utils";

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
  const objectives = buildObjectiveItems(record);
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

        {objectives.length > 0 ? <OneLinePillRow items={objectives} /> : null}
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

type CardPill = {
  key: string;
  content: ReactNode;
  ariaLabel?: string;
  emphasis?: boolean;
};

const PILL_GAP_PX = 8;

function OneLinePillRow({ items }: { items: CardPill[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const moreRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;

    const measure = () => {
      const width = container.getBoundingClientRect().width;
      const itemWidths = items.map((_, index) => itemRefs.current[index]?.getBoundingClientRect().width ?? 0);
      const allItemsWidth = itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) + PILL_GAP_PX * Math.max(0, items.length - 1);

      if (allItemsWidth <= width) {
        setVisibleCount((current) => (current === items.length ? current : items.length));
        return;
      }

      let nextVisibleCount = 0;
      let visibleWidth = 0;
      for (let count = 0; count < items.length; count += 1) {
        const hiddenCount = items.length - count;
        const moreWidth = moreRefs.current[hiddenCount]?.getBoundingClientRect().width ?? 0;
        const totalWidth = visibleWidth + moreWidth + (count > 0 ? PILL_GAP_PX * count : 0);
        if (totalWidth <= width) nextVisibleCount = count;
        visibleWidth += itemWidths[count] ?? 0;
      }

      setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [items]);

  const hiddenCount = Math.max(0, items.length - visibleCount);

  return (
    <div ref={containerRef} className="relative mt-4 w-full overflow-hidden">
      <div className="flex w-full flex-nowrap items-center gap-2">
        {items.slice(0, visibleCount).map((item) => (
          <Pill key={item.key} item={item} />
        ))}
        {hiddenCount > 0 ? (
          <Pill
            item={{
              key: "more",
              content: `+${hiddenCount}`,
              ariaLabel: `${hiddenCount} more project detail${hiddenCount === 1 ? "" : "s"}`,
              emphasis: true,
            }}
          />
        ) : null}
      </div>

      <div aria-hidden className="invisible pointer-events-none absolute left-0 top-0 flex flex-nowrap items-center gap-2">
        {items.map((item, index) => (
          <Pill
            key={`measure-${item.key}`}
            item={item}
            measureRef={(node) => {
              itemRefs.current[index] = node;
            }}
          />
        ))}
        {items.map((_, index) => {
          const hidden = index + 1;
          return (
            <Pill
              key={`measure-more-${hidden}`}
              item={{ key: `more-${hidden}`, content: `+${hidden}`, emphasis: true }}
              measureRef={(node) => {
                moreRefs.current[hidden] = node;
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Pill({ item, measureRef }: { item: CardPill; measureRef?: (node: HTMLSpanElement | null) => void }) {
  return (
    <span
      ref={measureRef}
      aria-label={item.ariaLabel}
      className={cn(
        "inline-flex h-7 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-sm font-medium",
        item.emphasis ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {item.content}
    </span>
  );
}

function buildObjectiveItems(record: BumicertsBumicertCardRecord): CardPill[] {
  const items: CardPill[] = (record.scopeTags ?? []).map((tag, index) => ({
    key: `scope-${index}-${tag}`,
    content: <span className="truncate">{formatScopeTag(tag)}</span>,
  }));

  if (record.locationCount > 0) {
    items.push({
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
    items.push({
      key: "contributors",
      content: (
        <>
          <UsersIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{formatCompactCount(record.contributorCount)}</span>
        </>
      ),
      ariaLabel: `${record.contributorCount} contributor${record.contributorCount === 1 ? "" : "s"}`,
    });
  }

  if (record.startDate || record.endDate) {
    items.push({
      key: "dates",
      content: <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden />,
      ariaLabel: "Project dates added",
    });
  }

  return items;
}

function formatScopeTag(tag: string): string {
  const clean = tag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
}

function formatCompactCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
