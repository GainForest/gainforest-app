"use client";

import Image from "next/image";
import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BumicertBadgeFilter } from "../_lib/indexer";

export type SourceFilterOption = {
  key: BumicertBadgeFilter;
  label: string;
  logoSrc: string;
};

// Collapsed "All filters" popover. Explore pages tuck all their filter
// controls in here instead of showing them inline; the trigger carries a
// count badge so active filters stay visible while collapsed.
export function AllFiltersPopover({
  activeCount,
  description,
  onClear,
  children,
}: {
  activeCount: number;
  description?: string;
  onClear: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("marketplace.explore");
  const active = activeCount > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <SlidersHorizontalIcon className="h-3.5 w-3.5" aria-hidden />
          {t("filters.allFilters")}
          {active && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] text-primary">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[min(70vh,32rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border-primary/20 p-4 shadow-[0_18px_45px_color-mix(in_oklab,var(--primary)_16%,transparent)]"
      >
        <div className="mb-3">
          <h2 className="text-base font-medium text-foreground">{t("filters.allTitle")}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
        <div className="mt-4 flex items-center justify-between border-t border-primary/15 pt-3">
          <p className="text-xs text-muted-foreground">{t("filters.updateHint")}</p>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("actions.clearAll")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Source badge chips (GainForest, Ma Earth, …) shared by the explore pages'
// "All filters" popovers. Renders bare buttons; the parent owns the layout.
export function SourceFilterChips({
  options,
  selected,
  onToggle,
}: {
  options: SourceFilterOption[];
  selected: BumicertBadgeFilter[];
  onToggle: (key: BumicertBadgeFilter) => void;
}) {
  return (
    <>
      {options.map((option) => {
        const isSelected = selected.includes(option.key);
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onToggle(option.key)}
            aria-pressed={isSelected}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/80">
              <Image src={option.logoSrc} width={20} height={20} alt="" className="h-5 w-5 object-contain" />
            </span>
            {option.label}
          </button>
        );
      })}
    </>
  );
}
