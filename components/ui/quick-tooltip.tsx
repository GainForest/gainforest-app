"use client";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { cn } from "@/lib/utils";

const QuickTooltip = ({
  children,
  content,
  asChild = false,
  openOnClick = false,
  triggerClassName,
  disabled = false,
  contentClassName,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  asChild?: boolean;
  openOnClick?: boolean;
  triggerClassName?: string;
  disabled?: boolean;
  contentClassName?: string;
}) => {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (disabled) {
      setOpen(false);
      return;
    }
    setOpen(open);
  };

  if (openOnClick) {
    return (
      <TooltipProvider>
        <Tooltip open={disabled ? false : open} onOpenChange={handleOpenChange}>
          <TooltipTrigger
            onClick={() => setOpen(true)}
            // onBlur={() => setOpen(false)}
            className={triggerClassName}
            asChild={asChild}
          >
            {children}
          </TooltipTrigger>
          <TooltipContent
            className={cn("text-center", contentClassName)}
          >
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip open={disabled ? false : undefined}>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent
          className={cn("text-center", contentClassName)}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default QuickTooltip;
