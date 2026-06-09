"use client";

import { useEffect } from "react";
import type { TreeUploadRowAttentionSummary, ValidatedRow } from "../../_lib/upload/types";
import type { UploadDatasetSelection } from "../../_lib/upload/upload-dataset-selection";
import type { UploadSiteSelection } from "../../_lib/upload/site-selection";
import { persistPendingUpload } from "./upload-session";

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
    if (!isUploadInProgress) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isUploadInProgress]);
}
