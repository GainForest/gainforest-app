"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BumicertCardPill = {
  key: string;
  content: ReactNode;
  ariaLabel?: string;
  emphasis?: boolean;
};

const PILL_GAP_PX = 8;

type VisiblePillCounts = {
  scope: number;
  icon: number;
};

export function BumicertPillRows({
  scopeItems,
  iconItems,
}: {
  scopeItems: BumicertCardPill[];
  iconItems: BumicertCardPill[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scopeRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const iconRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const moreRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [visibleCounts, setVisibleCounts] = useState<VisiblePillCounts>({ scope: 0, icon: 0 });

  const totalCount = scopeItems.length + iconItems.length;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || totalCount === 0) return;

    const measure = () => {
      const width = container.getBoundingClientRect().width;
      const scopeWidths = scopeItems.map((_, index) => scopeRefs.current[index]?.getBoundingClientRect().width ?? 0);
      const iconWidths = iconItems.map((_, index) => iconRefs.current[index]?.getBoundingClientRect().width ?? 0);

      let nextScopeCount = 0;
      let nextIconCount = 0;

      if (iconItems.length > 0) {
        nextScopeCount = fitLineWithoutMore(scopeWidths, width);
        nextIconCount = fitLastLine(iconWidths, width, scopeItems.length - nextScopeCount, moreRefs.current);
      } else {
        nextScopeCount = fitLastLine(scopeWidths, width, 0, moreRefs.current);
      }

      setVisibleCounts((current) =>
        current.scope === nextScopeCount && current.icon === nextIconCount
          ? current
          : { scope: nextScopeCount, icon: nextIconCount },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [iconItems, scopeItems, totalCount]);

  if (totalCount === 0) return null;

  const visibleScopeItems = scopeItems.slice(0, visibleCounts.scope);
  const visibleIconItems = iconItems.slice(0, visibleCounts.icon);
  const hiddenCount = Math.max(0, totalCount - visibleScopeItems.length - visibleIconItems.length);
  const showScopeLine = visibleScopeItems.length > 0 || (iconItems.length === 0 && hiddenCount > 0);
  const showIconLine = iconItems.length > 0 && (visibleIconItems.length > 0 || hiddenCount > 0);

  return (
    <div ref={containerRef} className="relative mt-4 w-full overflow-hidden">
      <div className="space-y-1.5">
        {showScopeLine ? (
          <PillLine>
            {visibleScopeItems.map((item) => (
              <Pill key={item.key} item={item} />
            ))}
            {iconItems.length === 0 && hiddenCount > 0 ? <MorePill hiddenCount={hiddenCount} /> : null}
          </PillLine>
        ) : null}

        {showIconLine ? (
          <PillLine>
            {visibleIconItems.map((item) => (
              <Pill key={item.key} item={item} />
            ))}
            {hiddenCount > 0 ? <MorePill hiddenCount={hiddenCount} /> : null}
          </PillLine>
        ) : null}
      </div>

      <div aria-hidden className="invisible pointer-events-none absolute left-0 top-0 flex flex-nowrap items-center gap-2">
        {scopeItems.map((item, index) => (
          <Pill
            key={`measure-scope-${item.key}`}
            item={item}
            measureRef={(node) => {
              scopeRefs.current[index] = node;
            }}
          />
        ))}
        {iconItems.map((item, index) => (
          <Pill
            key={`measure-icon-${item.key}`}
            item={item}
            measureRef={(node) => {
              iconRefs.current[index] = node;
            }}
          />
        ))}
        {Array.from({ length: totalCount }, (_, index) => {
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

function fitLineWithoutMore(itemWidths: number[], width: number): number {
  let count = 0;
  let usedWidth = 0;

  for (const itemWidth of itemWidths) {
    const nextWidth = usedWidth + itemWidth + (count > 0 ? PILL_GAP_PX : 0);
    if (nextWidth > width) break;
    usedWidth = nextWidth;
    count += 1;
  }

  return count;
}

function fitLastLine(
  itemWidths: number[],
  width: number,
  hiddenBeforeLine: number,
  moreRefs: Array<HTMLSpanElement | null>,
): number {
  let bestCount = 0;

  for (let count = 0; count <= itemWidths.length; count += 1) {
    const hiddenCount = hiddenBeforeLine + itemWidths.length - count;
    const moreWidth = hiddenCount > 0 ? moreRefs[hiddenCount]?.getBoundingClientRect().width ?? 0 : 0;
    const totalWidth = lineWidth(itemWidths, count, moreWidth);
    if (totalWidth <= width) bestCount = count;
  }

  return bestCount;
}

function lineWidth(itemWidths: number[], itemCount: number, moreWidth: number): number {
  const itemsWidth = itemWidths.slice(0, itemCount).reduce((sum, itemWidth) => sum + itemWidth, 0);
  const visibleCount = itemCount + (moreWidth > 0 ? 1 : 0);
  return itemsWidth + moreWidth + PILL_GAP_PX * Math.max(0, visibleCount - 1);
}

function PillLine({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-nowrap items-center gap-2">{children}</div>;
}

function MorePill({ hiddenCount }: { hiddenCount: number }) {
  return (
    <Pill
      item={{
        key: "more",
        content: `+${hiddenCount}`,
        ariaLabel: `${hiddenCount} more project detail${hiddenCount === 1 ? "" : "s"}`,
        emphasis: true,
      }}
    />
  );
}

function Pill({
  item,
  measureRef,
}: {
  item: BumicertCardPill;
  measureRef?: (node: HTMLSpanElement | null) => void;
}) {
  return (
    <span
      ref={measureRef}
      aria-label={item.ariaLabel}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 text-sm font-medium",
        item.emphasis ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {item.content}
    </span>
  );
}
