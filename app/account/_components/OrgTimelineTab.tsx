"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import type {
  TimelineMutationPermission,
  TimelineSourceData,
} from "@/app/cert/[did]/[rkey]/_components/timeline/EvidenceAdder";
import type { TimelineReference } from "@/app/cert/[did]/[rkey]/_components/timeline/timelineReferences";
import { TimelinePanel } from "@/app/cert/[did]/[rkey]/_components/timeline/viewers/TimelinePanel";
import { TimelineMotion } from "./TimelineMotion";

const EMPTY_TIMELINE_SOURCES: TimelineSourceData = {
  audio: [],
  occurrences: [],
  occurrencesIncomplete: false,
  treeGroups: [],
  places: [],
};

const ORG_TIMELINE_PAGE_SIZE = 25;

export function OrgTimelineTab({
  organizationDid,
  initialEntries,
  references,
  canDeleteEvidence,
  mutationRepo,
}: {
  organizationDid: string;
  initialEntries: TimelineAttachmentItem[];
  references: TimelineReference[];
  canDeleteEvidence: boolean;
  mutationRepo?: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const deletePermission: TimelineMutationPermission = canDeleteEvidence
    ? { allowed: true, reason: null }
    : { allowed: false, reason: null };

  function handleDeleted(rkey: string) {
    setEntries((current) => current.filter((entry) => entry.metadata.rkey !== rkey));
    router.refresh();
  }

  return (
    <TimelineMotion>
      <TimelinePanel
        organizationDid={organizationDid}
        entries={entries}
        sources={EMPTY_TIMELINE_SOURCES}
        references={references}
        canManageEvidence={canDeleteEvidence}
        deletePermission={deletePermission}
        mutationRepo={mutationRepo}
        onDeleted={handleDeleted}
        pageSize={ORG_TIMELINE_PAGE_SIZE}
        summaryScope="organization"
      />
    </TimelineMotion>
  );
}
