"use client";

import { useTranslations } from "./audio-copy";
import { cn } from "@/lib/utils";
import type { Section } from "./types";

export function AudioSectionTabs(props: {
  value: Section;
  counts: Record<Section, number>;
  onChange: (section: Section) => void;
}) {
  const t = useTranslations("upload.audio.sections");

  const tabs: Array<{ id: Section; label: string }> = [
    { id: "events", label: t("events") },
    { id: "deployments", label: t("deployments") },
    { id: "recordings", label: t("recordingsTab") },
  ];

  return (
    <div className="overflow-x-auto scrollbar-hidden -mx-4 px-4">
      <div className="flex items-end min-w-max border-b border-border">
        {tabs.map((tab) => {
          const isActive = props.value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => props.onChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap select-none cursor-pointer",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{tab.label}</span>
              <span className="text-xs text-muted-foreground">
                {props.counts[tab.id]}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
