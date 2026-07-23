"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BumicertOwnerAvatar } from "./BumicertOwnerAvatar";

// Retained for account-grid callers; global MotionConfig removes the opacity
// transition when the user requests reduced motion.
export const cardVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

function resolveImageSrc(coverImage: File | string): string {
  return typeof coverImage === "string"
    ? coverImage
    : URL.createObjectURL(coverImage);
}

export interface BumicertCardVisualProps {
  coverImage: File | string | null;
  logoUrl: string | null;
  logoRef?: string | null;
  ownerDid?: string | null;
  title: string;
  organizationName: string;
  objectives: string[];
  description?: string;
  className?: string;
}

export function BumicertCardVisual({
  coverImage,
  logoUrl,
  logoRef,
  ownerDid,
  title,
  organizationName,
  objectives,
  description,
  className,
}: BumicertCardVisualProps) {
  const t = useTranslations("bumicert.detail.recovery.card");
  const imageSrc = coverImage ? resolveImageSrc(coverImage) : null;
  const normalizedObjectives = objectives.filter(
    (objective): objective is string =>
      typeof objective === "string" && objective.trim().length > 0,
  );

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col overflow-hidden bg-muted/30 transition-colors motion-reduce:transition-none",
        className,
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden z-0">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={title}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="absolute inset-0 bg-muted"
            aria-label={t("missingImage")}
          />
        )}
      </div>
      <div className="relative px-4 py-3 -mt-6 z-1 flex-1 flex flex-col justify-between">
        <div className="absolute -top-2 left-0 right-0 h-8 bg-linear-to-b from-transparent via-background/65 to-background z-0"></div>
        <div>
          <h3 className="relative text-2xl font-instrument italic text-foreground leading-snug line-clamp-2 z-1">
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed line-clamp-2">
              {description}
            </p>
          )}
        </div>
        {normalizedObjectives.length > 0 && (
          <OneLineTextPillRow items={normalizedObjectives} />
        )}
      </div>

      <div className="absolute top-2 left-2 bg-background/70 rounded-full p-1 backdrop-blur-lg shadow-lg flex items-center gap-1 min-w-0">
        <BumicertOwnerAvatar
          did={ownerDid}
          avatarUrl={logoUrl}
          avatarRef={logoRef}
          label={organizationName}
          className="h-6 w-6 shrink-0 scale-120 shadow-sm transition-all duration-300 group-hover:scale-100"
        />
        <span className="text-xs font-medium text-foreground text-shadow-md whitespace-nowrap overflow-hidden">
          {organizationName.length > 22
            ? organizationName.slice(0, 20) + "..."
            : organizationName}
        </span>
      </div>
    </div>
  );
}

const PILL_GAP_PX = 8;

function OneLineTextPillRow({ items }: { items: string[] }) {
  const t = useTranslations("bumicert.detail.recovery.card");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const moreRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;

    const measure = () => {
      const width = container.getBoundingClientRect().width;
      const itemWidths = items.map(
        (_, index) =>
          itemRefs.current[index]?.getBoundingClientRect().width ?? 0,
      );
      const allItemsWidth =
        itemWidths.reduce((sum, itemWidth) => sum + itemWidth, 0) +
        PILL_GAP_PX * Math.max(0, items.length - 1);

      if (allItemsWidth <= width) {
        setVisibleCount((current) =>
          current === items.length ? current : items.length,
        );
        return;
      }

      let nextVisibleCount = 0;
      let visibleWidth = 0;
      for (let count = 0; count < items.length; count += 1) {
        const hiddenCount = items.length - count;
        const moreWidth =
          moreRefs.current[hiddenCount]?.getBoundingClientRect().width ?? 0;
        const totalWidth =
          visibleWidth + moreWidth + (count > 0 ? PILL_GAP_PX * count : 0);
        if (totalWidth <= width) nextVisibleCount = count;
        visibleWidth += itemWidths[count] ?? 0;
      }

      setVisibleCount((current) =>
        current === nextVisibleCount ? current : nextVisibleCount,
      );
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
        {hiddenCount > 0 && (
          <TextPill
            text={`+${hiddenCount}`}
            emphasis
            ariaLabel={t("moreObjectives", { count: hiddenCount })}
          />
        )}
      </div>

      <div
        aria-hidden
        className="invisible pointer-events-none absolute left-0 top-0 flex flex-nowrap items-center gap-2"
      >
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
