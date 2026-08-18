"use client";

import { PaperclipIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function TimelineEmpty() {
  const timelineT = useTranslations("bumicert.detail.timeline");

  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-soft bg-surface/50 px-6 py-12 text-center">
      <PaperclipIcon className="h-8 w-8 text-muted-foreground/50" />
      <h3 className="mt-3 text-sm font-medium text-foreground">
        {timelineT("emptyTitle")}
      </h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
        {timelineT("emptyDescription")}
      </p>
    </div>
  );
}
