"use client";

import { useState } from "react";
import FileDropStep from "./FileDropStep";
import ColumnMappingStep from "./ColumnMappingStep";
import PreviewStep from "./PreviewStep";
import UploadStep from "./UploadStep";
import type { ColumnMapping, TreeUploadRowAttentionSummary, ValidatedRow } from "../../_lib/upload/types";
import type { KoboMediaZipIndex } from "../../_lib/upload/kobo-media-zip";
import { NO_UPLOAD_DATASET_SELECTION, type UploadDatasetSelection } from "../../_lib/upload/upload-dataset-selection";
import type { UploadSiteSelection } from "../../_lib/upload/site-selection";
import { readPendingUpload } from "./upload-session";

type WizardState = {
  currentStep: 1 | 2 | 3 | 4;
  file: File | null;
  koboMediaZipFile: File | null;
  koboMediaZipIndex: KoboMediaZipIndex | null;
  parsedData: Record<string, string>[] | null;
  headers: string[] | null;
  mappings: ColumnMapping[];
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection | null;
};

const INITIAL_STATE: WizardState = {
  currentStep: 1,
  file: null,
  koboMediaZipFile: null,
  koboMediaZipIndex: null,
  parsedData: null,
  headers: null,
  mappings: [],
  validRows: [],
  previewSkippedRows: [],
  establishmentMeans: null,
  datasetSelection: NO_UPLOAD_DATASET_SELECTION,
  siteSelection: null,
};

function createUploadId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initWizard(did: string): { state: WizardState; uploadId: string } {
  if (typeof window === "undefined") {
    return { state: INITIAL_STATE, uploadId: createUploadId() };
  }
  const pending = readPendingUpload(did);
  if (pending) {
    return {
      state: {
        ...INITIAL_STATE,
        validRows: pending.validRows,
        previewSkippedRows: pending.previewSkippedRows,
        establishmentMeans: pending.establishmentMeans,
        datasetSelection: pending.datasetSelection,
        siteSelection: pending.siteSelection,
        currentStep: 4,
      },
      uploadId: pending.uploadId ?? createUploadId(),
    };
  }
  return { state: INITIAL_STATE, uploadId: createUploadId() };
}

const STEPS = [
  { number: 1, label: "Upload File" },
  { number: 2, label: "Map Columns" },
  { number: 3, label: "Preview" },
  { number: 4, label: "Upload" },
] as const;

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        const isLast = idx === STEPS.length - 1;
        return (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span className={`text-xs whitespace-nowrap ${isActive ? "text-foreground font-medium" : "text-muted-foreground/70"}`}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full transition-colors ${isCompleted ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TreeUploadWizard({ did, onDone }: { did: string; onDone: () => void }) {
  const [initial] = useState(() => initWizard(did));
  const [state, setState] = useState<WizardState>(initial.state);
  const [uploadId, setUploadId] = useState(initial.uploadId);

  const handleFileAndMappings = (
    file: File,
    koboMediaZipFile: File | null,
    koboMediaZipIndex: KoboMediaZipIndex | null,
    parsedData: Record<string, string>[],
    headers: string[],
    mappings: ColumnMapping[],
    establishmentMeans: string | null,
    datasetSelection: UploadDatasetSelection,
    siteSelection: UploadSiteSelection,
  ) => {
    setState((prev) => ({
      ...prev,
      file, koboMediaZipFile, koboMediaZipIndex, parsedData, headers, mappings,
      validRows: [], previewSkippedRows: [], establishmentMeans, datasetSelection, siteSelection,
      currentStep: 2,
    }));
  };

  const handleGoToPreview = () => setState((prev) => ({ ...prev, currentStep: 3 }));
  const handleMappingsChange = (mappings: ColumnMapping[]) => setState((prev) => ({ ...prev, mappings }));

  const handleValidRows = (validRows: ValidatedRow[], previewSkippedRows: TreeUploadRowAttentionSummary[]) => {
    setState((prev) => ({ ...prev, validRows, previewSkippedRows, currentStep: 4 }));
  };

  const handleComplete = () => {
    setUploadId(createUploadId());
    setState(INITIAL_STATE);
    onDone();
  };

  const handleBackToStep1 = () => setState((prev) => ({ ...prev, currentStep: 1 }));
  const handleBackToStep2 = () => setState((prev) => ({ ...prev, currentStep: 2 }));
  const handleBackToStep3 = () =>
    setState((prev) => ({ ...prev, currentStep: prev.parsedData !== null ? 3 : 1 }));

  const { currentStep, parsedData, headers, mappings, validRows, previewSkippedRows,
    koboMediaZipFile, koboMediaZipIndex, establishmentMeans, datasetSelection, siteSelection } = state;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-medium">Upload Trees</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV of tree occurrences to the GainForest network.
        </p>
      </div>
      <StepIndicator currentStep={currentStep} />

      {currentStep === 1 && (
        <FileDropStep
          uploadId={uploadId}
          did={did}
          initialEstablishmentMeans={establishmentMeans}
          initialDatasetSelection={datasetSelection}
          initialSiteSelection={siteSelection}
          onFileAndMappings={handleFileAndMappings}
        />
      )}

      {currentStep === 2 && headers !== null && parsedData !== null && (
        <ColumnMappingStep
          headers={headers}
          mappings={mappings}
          sampleData={parsedData.slice(0, 5)}
          onMappingsChange={handleMappingsChange}
          onBack={handleBackToStep1}
          onNext={handleGoToPreview}
        />
      )}

      {currentStep === 3 && parsedData !== null && (
        <PreviewStep
          parsedData={parsedData}
          mappings={mappings}
          koboMediaZipIndex={koboMediaZipIndex}
          siteSelection={siteSelection}
          onBack={handleBackToStep2}
          onNext={handleValidRows}
        />
      )}

      {currentStep === 4 && (
        <UploadStep
          uploadId={uploadId}
          did={did}
          validRows={validRows}
          previewSkippedRows={previewSkippedRows}
          koboMediaZipFile={koboMediaZipFile}
          establishmentMeans={establishmentMeans}
          datasetSelection={datasetSelection}
          siteSelection={siteSelection}
          backLabel={parsedData !== null ? "Back to Preview" : "Start Over"}
          onBack={handleBackToStep3}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}
