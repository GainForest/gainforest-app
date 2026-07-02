"use client";

import { createContext, useContext } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "gainforest-sidebar-collapsed";

const SidebarCollapsedContext = createContext(false);

export const SidebarCollapsedProvider = SidebarCollapsedContext.Provider;

export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapsedContext);
}

/** Wraps a trigger with a right-anchored tooltip, but only when the sidebar is
 *  collapsed to an icon rail (otherwise the label is already visible). */
export function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const collapsed = useSidebarCollapsed();
  if (!collapsed) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
