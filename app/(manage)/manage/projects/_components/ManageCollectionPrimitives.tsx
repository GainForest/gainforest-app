"use client";

import type { LucideIcon } from "lucide-react";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ManageCollectionView = "cards" | "list";

type ViewOption = {
  id: ManageCollectionView;
  label: string;
  icon?: LucideIcon;
};

export function ManageCollectionViewToggle({
  value,
  onChange,
  cardsLabel,
  listLabel,
  compact = false,
  className,
}: {
  value: ManageCollectionView;
  onChange: (value: ManageCollectionView) => void;
  cardsLabel: string;
  listLabel: string;
  compact?: boolean;
  className?: string;
}) {
  const options: ViewOption[] = [
    { id: "cards", label: cardsLabel, icon: LayoutGridIcon },
    { id: "list", label: listLabel, icon: ListIcon },
  ];

  return (
    <div className={cn("inline-flex h-10 shrink-0 items-center rounded-full bg-muted p-0.5", className)}>
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          aria-label={label}
          title={label}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-full text-sm font-medium transition-colors motion-reduce:transition-none",
            compact ? "w-9 p-0 sm:w-auto sm:gap-1.5 sm:px-3" : "gap-1.5 px-3",
            value === id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon ? <Icon className="size-4" aria-hidden /> : null}
          <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function ManageCollectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string | null;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-3xl">
        <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
