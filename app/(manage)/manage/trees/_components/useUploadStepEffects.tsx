"use client";

import { useEffect } from "react";
import type { MutableRefObject, ReactNode } from "react";
import type { TreeUploadRowAttentionSummary, ValidatedRow } from "../../_lib/upload/types";
import type { UploadDatasetSelection } from "../../_lib/upload/upload-dataset-selection";
import type { UploadSiteSelection } from "../../_lib/upload/site-selection";
import { MODAL_IDS } from "@/components/global/modals/ids";
import type { TreeUploadEventPayload } from "@/lib/analytics/events";
import { trackTreeUploadFeedbackPromptShown } from "@/lib/analytics/hotjar";
import { persistPendingUpload } from "./upload-session";
import { TreeUploadCompleteModal } from "./TreeUploadCompleteModal";

type ModalVariant = {
  id: string;
  content: ReactNode;
  dialogWidth?: string;
};

type UseUploadStepEffectsArgs = {
  did: string;
  uploadId: string;
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection | null;
  uploadStarted: boolean;
  runUpload: () => Promise<void>;
  uploadDone: boolean;
  hasPhotoAttachments: boolean;
  persistedCount: number;
  photoFetchStarted: boolean;
  uploadFatalError: string | null;
  runPhotoFetch: () => Promise<void>;
  isUploadInProgress: boolean;
  setClockMs: (value: number) => void;
  allPhasesComplete: boolean;
  shouldShowCompletionModal: boolean;
  completionModalShownRef: MutableRefObject<boolean>;
  total: number;
  partials: number;
  failures: number;
  rowAttentionSummaries: TreeUploadRowAttentionSummary[];
  photoFailureCount: number;
  treeManagerHref: string;
  treeManagerLabel: string;
  completionAnalyticsPayload: TreeUploadEventPayload;
  onUploadMore: () => void;
  pushModal: (variant: ModalVariant, replaceAll?: boolean) => void;
  show: () => Promise<void>;
};

export function useUploadStepEffects({
  did,
  uploadId,
  validRows,
  previewSkippedRows,
  establishmentMeans,
  datasetSelection,
  siteSelection,
  uploadStarted,
  runUpload,
  uploadDone,
  hasPhotoAttachments,
  persistedCount,
  photoFetchStarted,
  uploadFatalError,
  runPhotoFetch,
  isUploadInProgress,
  setClockMs,
  allPhasesComplete,
  shouldShowCompletionModal,
  completionModalShownRef,
  total,
  partials,
  failures,
  rowAttentionSummaries,
  photoFailureCount,
  treeManagerHref,
  treeManagerLabel,
  completionAnalyticsPayload,
  onUploadMore,
  pushModal,
  show,
}: UseUploadStepEffectsArgs) {
  useEffect(() => {
    if (validRows.length === 0 || uploadStarted || !siteSelection) return;

    persistPendingUpload({
      ownerDid: did,
      uploadId,
      validRows,
      previewSkippedRows,
      establishmentMeans,
      datasetSelection,
      siteSelection,
    });
  }, [datasetSelection, did, establishmentMeans, previewSkippedRows, siteSelection, uploadId, uploadStarted, validRows]);

  useEffect(() => {
    if (!uploadStarted) void runUpload();
  }, [runUpload, uploadStarted]);

  useEffect(() => {
    if (uploadDone && hasPhotoAttachments && persistedCount > 0 && !photoFetchStarted && !uploadFatalError) {
      void runPhotoFetch();
    }
  }, [hasPhotoAttachments, persistedCount, photoFetchStarted, runPhotoFetch, uploadDone, uploadFatalError]);

  useEffect(() => {
    if (!isUploadInProgress) return;
    const intervalId = window.setInterval(() => setClockMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [isUploadInProgress, setClockMs]);

  useEffect(() => {
    if (
      !allPhasesComplete ||
      !shouldShowCompletionModal ||
      uploadFatalError ||
      completionModalShownRef.current
    ) {
      return;
    }

    completionModalShownRef.current = true;
    trackTreeUploadFeedbackPromptShown(completionAnalyticsPayload);

    pushModal(
      {
        id: MODAL_IDS.UPLOAD_TREES_COMPLETE,
        content: (
          <TreeUploadCompleteModal
            totalCount={total}
            savedCount={persistedCount}
            partialCount={partials}
            failedCount={failures}
            rowAttentionSummaries={rowAttentionSummaries}
            photoFailureCount={photoFailureCount}
            treeManagerHref={treeManagerHref}
            treeManagerLabel={treeManagerLabel}
            analyticsPayload={completionAnalyticsPayload}
            onUploadMore={onUploadMore}
          />
        ),
        dialogWidth: "max-w-lg",
      },
      true,
    );
    void show();
  }, [
    allPhasesComplete,
    completionAnalyticsPayload,
    completionModalShownRef,
    failures,
    onUploadMore,
    partials,
    persistedCount,
    photoFailureCount,
    pushModal,
    rowAttentionSummaries,
    shouldShowCompletionModal,
    show,
    total,
    treeManagerHref,
    treeManagerLabel,
    uploadFatalError,
  ]);

  useEffect(() => {
    if (!isUploadInProgress) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isUploadInProgress]);
}
