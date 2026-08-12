"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TestBadge({ label, description }: { label: string; description: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-primary"
            aria-label={label}
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8} className="max-w-80 text-left">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
