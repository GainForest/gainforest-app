"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Profile bio with an in-place reveal. The affordance rides the end of the
 * clamped text instead of taking its own row, so the hero spends no extra
 * height on it — and it renders only when the text is genuinely cut off, so a
 * bio that fits in three lines shows no control at all. Line breaks the author
 * typed are preserved in both states.
 */
export function ExpandableBio({
  text,
  className,
  emptyClassName,
  placeholder,
}: {
  text: string;
  className?: string;
  emptyClassName?: string;
  placeholder?: string;
}) {
  const t = useTranslations("upload.dashboardClient.hero");
  const bioRef = useRef<HTMLParagraphElement>(null);
  const bioId = useId();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  const body = text || placeholder || "";
  const isPlaceholder = !text && Boolean(placeholder);

  useEffect(() => {
    const element = bioRef.current;
    if (!element || expanded) return;

    // Measure rather than counting characters: the same bio wraps differently
    // across locales and across the hero's md breakpoint.
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => observer.disconnect();
  }, [body, expanded]);

  if (!body) return null;

  return (
    <div className={cn("relative", className)}>
      <p
        ref={bioRef}
        id={bioId}
        className={cn(
          "whitespace-pre-line text-sm leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-3",
          isPlaceholder && emptyClassName,
        )}
      >
        {body}
        {expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded
            aria-controls={bioId}
            aria-label={t("collapseBio")}
            className="ml-1.5 align-baseline text-sm font-medium text-primary transition-opacity hover:opacity-75 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("readLess")}
          </button>
        ) : null}
      </p>
      {clamped && !expanded ? (
        /* Sits on the last clamped line and fades the cut word out beneath it,
           so the reveal is exactly where reading stopped. */
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls={bioId}
          aria-label={t("expandBio")}
          className="absolute bottom-0 right-0 bg-card pl-1 text-sm font-medium leading-relaxed text-primary transition-opacity before:absolute before:right-full before:top-0 before:h-full before:w-10 before:bg-linear-to-r before:from-transparent before:to-card before:content-[''] hover:opacity-75 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("readMore")}
        </button>
      ) : null}
    </div>
  );
}
