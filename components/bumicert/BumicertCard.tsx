"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function resolveImageSrc(coverImage: File | string): string {
  return typeof coverImage === "string" ? coverImage : URL.createObjectURL(coverImage);
}

export const cardVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    filter: "blur(4px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
};

const orgLabelTextVariants = {
  initial: {
    opacity: 0,
    maxWidth: 0,
    marginLeft: "-0.25rem",
    marginRight: "0rem",
    pointerEvents: "none",
    x: -2,
    filter: "blur(4px)",
  },
  cardHover: {
    opacity: 1,
    maxWidth: 200,
    marginLeft: "0rem",
    marginRight: "0.5rem",
    pointerEvents: "auto",
    x: 0,
    filter: "blur(0px)",
  },
};

export interface BumicertCardVisualProps {
  coverImage: File | string | null;
  logoUrl: string | null;
  title: string;
  organizationName: string;
  objectives: string[];
  description?: string;
  className?: string;
}

export function BumicertCardVisual({
  coverImage,
  logoUrl,
  title,
  organizationName,
  objectives,
  description,
  className,
}: BumicertCardVisualProps) {
  const imageSrc = coverImage ? resolveImageSrc(coverImage) : null;
  const normalizedObjectives = objectives.filter(
    (objective): objective is string =>
      typeof objective === "string" && objective.trim().length > 0,
  );

  return (
    <motion.div
      className={cn(
        "group relative rounded-2xl border border-border bg-card hover:shadow-lg overflow-hidden w-full flex flex-col transition-all duration-300",
        className,
      )}
      initial="initial"
      whileHover="cardHover"
    >
      <div className="relative aspect-4/3 overflow-hidden z-0">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={title}
            fill
            unoptimized
            className="object-cover scale-110 group-hover:scale-100 transition-all duration-300"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" aria-label="Missing image" />
        )}
      </div>
      <div className="relative px-4 py-3 -mt-6 z-1 flex-1 flex flex-col justify-between">
        <div className="absolute -top-2 left-0 right-0 h-8 bg-linear-to-b from-transparent via-background/65 to-background z-0"></div>
        <div>
          <h3 className="relative text-2xl font-instrument italic text-foreground leading-snug line-clamp-1 z-1">
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {description}
            </p>
          )}
        </div>
        {normalizedObjectives.length > 0 && <OneLineTextPillRow items={normalizedObjectives} />}
      </div>

      <div className="absolute top-2 left-2 bg-background/70 rounded-full p-1 backdrop-blur-lg shadow-lg flex items-center gap-1 min-w-0">
        <div className="relative h-6 w-6 rounded-full bg-white shadow-sm overflow-hidden shrink-0 scale-120 group-hover:scale-100 transition-all duration-300">
          {logoUrl ? (
            <Image src={logoUrl} alt={organizationName} fill unoptimized className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground">
              {organizationName.charAt(0)}
            </div>
          )}
        </div>
        <motion.span
          variants={orgLabelTextVariants}
          className="text-xs font-medium text-foreground text-shadow-md whitespace-nowrap overflow-hidden"
        >
          {organizationName.length > 22
            ? organizationName.slice(0, 20) + "..."
            : organizationName}
        </motion.span>
      </div>
    </motion.div>
  );
}

const PILL_GAP_PX = 8;

function OneLineTextPillRow({ items }: { items: string[] }) {
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
        {items.slice(0, visibleCount).map((item, index) => (
          <TextPill key={`${item}-${index}`} text={item} />
        ))}
        {hiddenCount > 0 && <TextPill text={`+${hiddenCount}`} emphasis ariaLabel={`${hiddenCount} more objective${hiddenCount === 1 ? "" : "s"}`} />}
      </div>

      <div aria-hidden className="invisible pointer-events-none absolute left-0 top-0 flex flex-nowrap items-center gap-2">
        {items.map((item, index) => (
          <TextPill
            key={`measure-${item}-${index}`}
            text={item}
            measureRef={(node) => {
              itemRefs.current[index] = node;
            }}
          />
        ))}
        {items.map((_, index) => {
          const hidden = index + 1;
          return (
            <TextPill
              key={`measure-more-${hidden}`}
              text={`+${hidden}`}
              emphasis
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

function TextPill({
  text,
  emphasis = false,
  ariaLabel,
  measureRef,
}: {
  text: string;
  emphasis?: boolean;
  ariaLabel?: string;
  measureRef?: (node: HTMLSpanElement | null) => void;
}) {
  return (
    <span
      ref={measureRef}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-7 max-w-[11rem] shrink-0 items-center rounded-full bg-muted px-2.5 text-sm font-medium",
        emphasis ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}

export function BumicertCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="relative aspect-4/3 overflow-hidden bg-muted animate-pulse">
        <div className="absolute top-2 left-2 bg-background/70 rounded-full p-1 pr-3 flex items-center gap-1">
          <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />
        </div>
      </div>

      <div className="px-4 py-3 -mt-6 relative z-1 space-y-2">
        <div className="h-7 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
        <div className="flex gap-2 pt-1">
          <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
          <div className="h-6 w-10 rounded-full bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
