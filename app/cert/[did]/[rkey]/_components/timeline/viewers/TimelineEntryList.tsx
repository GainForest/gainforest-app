"use client";

import type { TimelineEntryViewModel } from "../shared/timelineViewModel";
import type { TimelineMapLayer } from "./shared/timelineMapLayers";
import { TimelineEntry } from "./TimelineEntry";

type TimelineEntryListItem = TimelineEntryViewModel & {
  mapLayers: TimelineMapLayer[];
};

export function TimelineEntryList({
  entries,
  canManageEvidence,
  canDeleteEvidence,
  deleteDisabledReason,
  mutationRepo,
  onDeleted,
}: {
  entries: TimelineEntryListItem[];
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
          mapLayers={entry.mapLayers}
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
