"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Parse a "yyyy-MM-dd" string into a local Date (no timezone drift). */
function fromValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Serialize a Date back into a "yyyy-MM-dd" string. */
function toValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Dates before this ("yyyy-MM-dd") are not selectable. */
  min?: string;
  /** Dates after this ("yyyy-MM-dd") are not selectable. */
  max?: string;
  className?: string;
  id?: string;
};

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
  min,
  max,
  className,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = fromValue(value);
  const minDate = min ? fromValue(min) : undefined;
  const maxDate = max ? fromValue(max) : undefined;
  const disabledMatchers =
    minDate && maxDate
      ? { before: minDate, after: maxDate }
      : minDate
        ? { before: minDate }
        : maxDate
          ? { after: maxDate }
          : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl bg-muted/60 px-4 py-2.5 text-left text-sm text-foreground outline-none transition-colors",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/25 data-[state=open]:bg-muted data-[state=open]:ring-2 data-[state=open]:ring-primary/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground/65")}>
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? minDate}
          disabled={disabledMatchers}
          onSelect={(date) => {
            if (date) onChange(toValue(date));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
