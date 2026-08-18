"use client";

import { LightbulbIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";

export interface CalendarRangeProps {
  value?: [Date, Date] | null;
  onValueChange?: (value: [Date, Date] | null) => void;
}

export function CalendarRange({ value, onValueChange }: CalendarRangeProps) {
  const handleSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onValueChange?.([range.from, range.to]);
    } else {
      onValueChange?.(null);
    }
  };

  return (
    <>
      <Calendar
        className="h-[340px] w-full"
        mode="range"
        defaultMonth={value?.[0]}
        selected={value ? { from: value[0], to: value[1] } : undefined}
        onSelect={handleSelect}
        numberOfMonths={2}
        captionLayout="dropdown"
      />
      <div className="mb-2 flex w-full items-center justify-center text-center text-sm text-primary">
        <span className="flex items-center gap-2 rounded-lg bg-muted px-2 py-1">
          <LightbulbIcon className="size-4" />
          Double click a date to change the start date.
        </span>
      </div>
    </>
  );
}
