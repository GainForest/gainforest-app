"use client";

import type { TimelineEntryViewModel } from "../shared/timelineViewModel";
import { TimelineEntry } from "./TimelineEntry";

export function TimelineEntryList({
  entries,
  canManageEvidence,
  canDeleteEvidence,
  deleteDisabledReason,
  mutationRepo,
  onDeleted,
}: {
  entries: TimelineEntryViewModel[];
  canManageEvidence: boolean;
  canDeleteEvidence: boolean;
  deleteDisabledReason: string | null;
  mutationRepo?: string;
  onDeleted: (rkey: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <TimelineEntry
          key={entry.entryId}
          entry={entry}
          canManageEvidence={canManageEvidence}
          canDeleteEvidence={canDeleteEvidence}
          deleteDisabledReason={deleteDisabledReason}
          mutationRepo={mutationRepo}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
