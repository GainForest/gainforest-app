"use client";

import type { ElementType } from "react";
import { cn } from "@/lib/utils";

export type ManageViewOption<T extends string> = {
  id: T;
  label: string;
  icon: ElementType;
};

export function ManageViewToggle<T extends string>({
  value,
  onChange,
  options,
  compactLabels = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly ManageViewOption<T>[];
  compactLabels?: boolean;
}) {
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-full bg-muted/50 p-0.5" role="group">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          aria-label={label}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none",
            value === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          <span className={compactLabels ? "hidden sm:inline" : undefined}>{label}</span>
        </button>
      ))}
    </div>
  );
}
