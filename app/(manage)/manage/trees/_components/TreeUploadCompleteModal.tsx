"use client";

import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseIcon,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODAL_IDS } from "@/components/global/modals/ids";
import { useIsDrawer, useModal } from "@/components/ui/modal/context";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import {
  TREE_UPLOAD_EVENTS,
  type TreeUploadEventPayload,
} from "@/lib/analytics/events";
import { trackTreeUploadEvent } from "@/lib/analytics/hotjar";
import { cn } from "@/lib/utils";
import type { TreeUploadRowAttentionSummary } from "../../_lib/upload/types";
import { getTreeUploadRowAttentionKindLabel } from "../../_lib/upload/row-attention";
import { TreeUploadFeedbackModal } from "./TreeUploadFeedbackModal";

type TreeUploadCompleteModalProps = {
  totalCount: number;
  savedCount: number;
  partialCount: number;
  failedCount: number;
  rowAttentionSummaries: TreeUploadRowAttentionSummary[];
  photoFailureCount: number;
  treeManagerHref: string;
  treeManagerLabel: string;
  analyticsPayload: TreeUploadEventPayload;
  onUploadMore: () => void;
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function TreeUploadCompleteModal({
  totalCount,
  savedCount,
  partialCount,
  failedCount,
  rowAttentionSummaries,
  photoFailureCount,
  treeManagerHref,
  treeManagerLabel,
  analyticsPayload,
  onUploadMore,
}: TreeUploadCompleteModalProps) {
  const { hide, clear, pushModal } = useModal();
  const router = useRouter();
  // In drawer mode the whole sheet scrolls; releasing this nested review list
  // avoids a touch-scroll trap inside the drawer body.
  const isDrawer = useIsDrawer();

  const hasRowAttention =
    partialCount > 0 || failedCount > 0 || rowAttentionSummaries.length > 0;
  const hasPhotoAttention = photoFailureCount > 0;
  const hasAttention = hasRowAttention || hasPhotoAttention;

  const handleStayOnSummary = async () => {
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FEEDBACK_DISMISSED, analyticsPayload);
    await hide();
    clear();
  };

  const handleUploadMore = async () => {
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.UPLOAD_MORE_CLICKED, analyticsPayload);
    await hide();
    clear();
    onUploadMore();
  };

  const handleViewTrees = async () => {
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.VIEW_TREES_CLICKED, analyticsPayload);
    await hide();
    clear();
    router.push(treeManagerHref);
  };

  const handleFeedback = () => {
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FEEDBACK_FORM_OPENED, analyticsPayload);
    pushModal({
      id: MODAL_IDS.UPLOAD_TREES_FEEDBACK,
      content: <TreeUploadFeedbackModal analyticsPayload={analyticsPayload} />,
      dialogWidth: "max-w-4xl",
    });
  };

  return (
    <ModalContent dismissible={false} className="space-y-5">
      <ModalHeader>
        <ModalTitle>Tree upload complete</ModalTitle>
        <ModalDescription>
          Your upload has finished. Please share feedback so we can make this
          easier for the next person.
        </ModalDescription>
      </ModalHeader>

      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-primary/20 bg-primary/5 px-4 py-5 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-7" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">
              {pluralize(savedCount, "tree")} saved
            </p>
            <p className="text-sm text-muted-foreground">
              Upload complete for {pluralize(totalCount, "row")}. {savedCount > 0
                ? "Your saved trees are available in tree manager."
                : "No trees were saved from this upload."}
            </p>
          </div>
        </div>

        {hasAttention ? (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Some items need review</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {partialCount > 0 ? (
                    <li>
                      {pluralize(partialCount, "saved row")} {" "}
                      {partialCount === 1 ? "needs" : "need"} follow-up.
                    </li>
                  ) : null}
                  {failedCount > 0 ? (
                    <li>
                      {pluralize(failedCount, "row")} skipped or failed to
                      save.
                    </li>
                  ) : null}
                  {photoFailureCount > 0 ? (
                    <li>
                      {pluralize(photoFailureCount, "photo")} could not be
                      saved automatically.
                    </li>
                  ) : null}
                </ul>
                {rowAttentionSummaries.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-yellow-500/20 bg-background/60 p-2">
                    <p className="mb-2 text-xs font-medium text-foreground">
                      Rows needing review
                    </p>
                    <ul className={cn("space-y-2 pr-1 text-xs", !isDrawer && "max-h-44 overflow-y-auto")}>
                      {rowAttentionSummaries.map((summary) => (
                        <li
                          key={`${summary.kind}-${summary.sourceRowIndex}`}
                          className="rounded-lg border border-yellow-500/20 bg-background/80 p-2"
                        >
                          <p className="font-medium text-foreground">
                            Row {summary.sourceRowIndex + 1} — {summary.rowLabel}
                          </p>
                          <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                            {getTreeUploadRowAttentionKindLabel(summary.kind)}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-muted-foreground">
                            {summary.messages.map((message, messageIndex) => (
                              <li key={messageIndex}>{message}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ModalFooter className="gap-2 sm:flex-wrap">
        <Button onClick={handleFeedback}>
          <MessageSquareText />
          Share feedback
        </Button>
        <Button variant="outline" onClick={handleViewTrees}>
          <DatabaseIcon />
          {treeManagerLabel}
        </Button>
        <Button variant="outline" onClick={handleUploadMore}>
          <RotateCcw />
          Upload more trees
        </Button>
        <Button variant="ghost" onClick={handleStayOnSummary}>
          Stay on summary
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
