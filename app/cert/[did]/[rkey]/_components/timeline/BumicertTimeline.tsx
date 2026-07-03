"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { isAttachmentForAnyActivity } from "./attachmentSubjects";
import {
  EvidenceAdder,
  type TimelineMutationPermission,
  type TimelineSourceData,
} from "./EvidenceAdder";
import type { TimelineReference } from "./timelineReferences";
import { TimelinePanel } from "./viewers/TimelinePanel";

type BumicertTimelineProps = {
  organizationDid: string;
  activityUri: string;
  activityCid: string;
  /**
   * Activity URIs whose attachments should appear in this timeline. Defaults to
   * `[activityUri]`. The project page passes both the Cert URI and the project
   * (collection) URI so legacy project-pinned evidence stays visible.
   */
  matchActivityUris?: string[];
  bumicertTitle: string;
  canManageEvidence: boolean;
  createPermission: TimelineMutationPermission;
  deletePermission: TimelineMutationPermission;
  mutationRepo?: string;
  initialEntries: TimelineAttachmentItem[];
  sources: TimelineSourceData;
  references?: TimelineReference[];
  attachmentsUnavailable: boolean;
  previewMode?: boolean;
  previewLimit?: number;
  seeMoreHref?: string;
};

export function BumicertTimeline({
  organizationDid,
  activityUri,
  activityCid,
  matchActivityUris,
  canManageEvidence,
  createPermission,
  deletePermission,
  mutationRepo,
  initialEntries,
  sources,
  references = [],
  attachmentsUnavailable,
  previewMode = false,
  previewLimit,
  seeMoreHref,
}: BumicertTimelineProps) {
  const router = useRouter();
  const timelineT = useTranslations("bumicert.detail.timeline");
  const matchUris = matchActivityUris && matchActivityUris.length > 0 ? matchActivityUris : [activityUri];
  const [entries, setEntries] = useState(() =>
    initialEntries.filter((entry) => isAttachmentForAnyActivity(entry, matchUris)),
  );
  const [status, setStatus] = useState<string | null>(null);

  function handleCreated(created: TimelineAttachmentItem) {
    setEntries((current) => [
      created,
      ...current.filter((entry) => entry.metadata.rkey !== created.metadata.rkey),
    ]);
    setStatus(timelineT("linkSuccess"));
  }

  function handleDeleted(rkey: string) {
    setEntries((current) => current.filter((entry) => entry.metadata.rkey !== rkey));
    router.refresh();
  }

  return (
    <motion.article
      key="timeline"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="py-1"
    >
      <div className="flex flex-col gap-6">
        {canManageEvidence && !previewMode ? (
          <section className="space-y-3 rounded-2xl bg-muted p-4" aria-labelledby="link-evidence-heading">
            {attachmentsUnavailable ? (
              <p className="rounded-2xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">
                {timelineT("linksUnavailable")}
              </p>
            ) : null}
            <EvidenceAdder
              organizationDid={organizationDid}
              activityUri={activityUri}
              activityCid={activityCid}
              sources={sources}
              entries={entries}
              attachmentsUnavailable={attachmentsUnavailable}
              createPermission={createPermission}
              mutationRepo={mutationRepo}
              onCreated={handleCreated}
              onChanged={() => router.refresh()}
            />
            {status ? <p className="text-sm text-primary">{status}</p> : null}
          </section>
        ) : null}

        <TimelinePanel
          organizationDid={organizationDid}
          entries={entries}
          sources={sources}
          references={references}
          canManageEvidence={canManageEvidence}
          deletePermission={deletePermission}
          mutationRepo={mutationRepo}
          onDeleted={handleDeleted}
          previewMode={previewMode}
          previewLimit={previewLimit}
          seeMoreHref={seeMoreHref}
        />
      </div>
    </motion.article>
  );
}
