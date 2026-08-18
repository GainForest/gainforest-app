"use client";

import { useTranslations } from "next-intl";
import { buildWorkScopeLabels, formatWorkScopeTag } from "../_lib/work-scope-labels";

/**
 * Render a project's focus-area / work-scope tags, inherited from its single
 * Cert. Shown on project cards in place of a redundant "1 Cert" count.
 *
 * `variant="chip"` renders rounded secondary chips (grid cards); `variant="text"`
 * renders plain inline labels (compact list rows). Returns null when there are
 * no tags so callers can fall back to other metadata.
 */
export function ProjectScopeTags({
  tags,
  variant = "chip",
  max = 3,
}: {
  tags: string[];
  variant?: "chip" | "text";
  max?: number;
}) {
  const t = useTranslations("common.workScopes");
  if (!tags || tags.length === 0) return null;

  const labels = buildWorkScopeLabels(t);
  const shown = tags.slice(0, max);
  const extra = tags.length - shown.length;

  if (variant === "text") {
    return (
      <>
        {shown.map((tag) => (
          <span key={tag}>{formatWorkScopeTag(tag, labels)}</span>
        ))}
        {extra > 0 ? <span>+{extra}</span> : null}
      </>
    );
  }

  return (
    <>
      {shown.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground"
        >
          {formatWorkScopeTag(tag, labels)}
        </span>
      ))}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
          +{extra}
        </span>
      ) : null}
    </>
  );
}
