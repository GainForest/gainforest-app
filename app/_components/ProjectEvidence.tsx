"use client";

import { ClipboardCheckIcon, LeafIcon, MapPinnedIcon, PaperclipIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProjectEvidenceCounts } from "../_lib/indexer";

/**
 * Compact at-a-glance evidence summary for a project card: mapped site
 * boundaries, nature sightings, timeline items, and reviews. Zero-states stay
 * visible (muted) so evidence-rich and evidence-light projects are
 * distinguishable at a glance, mirroring the Cert detail Evidence section.
 */
export function ProjectEvidence({ evidence, className }: { evidence?: ProjectEvidenceCounts; className?: string }) {
  const t = useTranslations("marketplace.projects.evidence");
  if (!evidence) return null;

  const items = [
    { key: "boundaries", Icon: MapPinnedIcon, count: evidence.boundaries, label: t("boundaries", { count: evidence.boundaries }) },
    { key: "sightings", Icon: LeafIcon, count: evidence.sightings, label: t("sightings", { count: evidence.sightings }) },
    { key: "timeline", Icon: PaperclipIcon, count: evidence.timeline, label: t("timeline", { count: evidence.timeline }) },
    { key: "reviews", Icon: ClipboardCheckIcon, count: evidence.reviews, label: t("reviews", { count: evidence.reviews }) },
  ];

  return (
    <ul className={className ? className : "flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5"}>
      {items.map(({ key, Icon, count, label }) => (
        <li
          key={key}
          className={`inline-flex items-center gap-1 ${count > 0 ? "text-foreground/70" : "text-muted-foreground/55"}`}
        >
          <Icon
            className={`h-3 w-3 shrink-0 ${count > 0 ? "text-primary" : "text-muted-foreground/45"}`}
            aria-hidden
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
