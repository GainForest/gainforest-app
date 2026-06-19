"use client";

import { CheckIcon, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export function CheckRow({
  selected,
  onToggle,
  primary,
  secondary,
  status,
  disabled,
  icon: Icon,
}: {
  selected: boolean;
  onToggle: () => void;
  primary: string;
  secondary?: string;
  status?: string;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border bg-background px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background",
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:border-primary/30 hover:bg-muted/30",
      )}
    >
      {selected ? (
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary p-0.5 text-primary-foreground">
          <CheckIcon className="h-3 w-3" />
        </span>
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <Icon className="h-4 w-4 shrink-0 text-primary/70" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium text-foreground",
            selected && "text-primary",
          )}
        >
          {primary}
        </span>
        {secondary ? (
          <span className="block truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
        {status ? (
          <span className="block text-xs font-medium text-muted-foreground">
            {status}
          </span>
        ) : null}
      </span>
    </button>
  );
}
