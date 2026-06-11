"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CirclePlus, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useModal } from "@/components/ui/modal/context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCsvParser } from "../../_lib/upload/use-csv-parser";
import { PARTNER_ESTABLISHMENT_MEANS_OPTIONS } from "../../_lib/upload/establishment-means";
import { detectKoboFormat } from "../../_lib/upload/kobo-mapper";
import { autoDetectMappings } from "../../_lib/upload/column-mapper";
import { fetchUploadTreeDatasets, type UploadTreeDatasetItem } from "../../_lib/upload/tree-upload-datasets";
import { buildKoboMediaZipIndex, type KoboMediaZipIndex } from "../../_lib/upload/kobo-media-zip";
import type { ColumnMapping } from "../../_lib/upload/types";
import {
  NO_UPLOAD_DATASET_SELECTION,
  type ExistingUploadDatasetSelection,
  type UploadDatasetSelection,
} from "../../_lib/upload/upload-dataset-selection";
import {
  getBoundaryCapableUploadSites,
  resolveUploadSiteSelection,
  shouldOfferCreateUploadSiteBoundary,
  toUploadSiteSelection,
  uploadSiteHasBoundary,
  uploadSiteHasTransientBoundary,
  type UploadSiteSelection,
} from "../../_lib/upload/site-selection";
import {
  fetchUploadSiteBoundary,
} from "../../_lib/upload/site-boundary";
import type { ManagedLocation } from "@/app/_lib/indexer";
import { SiteEditorModal, SiteEditorModalId } from "../../_modals/SiteEditorModal";
import TreeDataGuide, { KoboExportGuide } from "./TreeDataGuide";
import { TREE_UPLOAD_EVENTS } from "@/lib/analytics/events";
import { getFileExtension, getFileSizeBucket } from "@/lib/analytics/tree-upload";
import { trackTreeUploadEvent } from "@/lib/analytics/hotjar";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".csv", ".tsv"];
const ACCEPTED_MIME_TYPES = ["text/csv", "text/tab-separated-values", "application/csv"];
const ACCEPTED_MEDIA_ZIP_MIME_TYPES = ["application/zip", "application/x-zip-compressed", "multipart/x-zip"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    (file.type !== "" && ACCEPTED_MIME_TYPES.includes(file.type));
}

function isAcceptedMediaZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip") ||
    (file.type !== "" && ACCEPTED_MEDIA_ZIP_MIME_TYPES.includes(file.type));
}

function plainPhotoFolderReadError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (message.startsWith("This photo folder") || message.startsWith("The selected photo folder")) return message;
  return "Could not read this photo folder. Make sure you selected the photo folder downloaded from your field form app.";
}

function toExistingDatasetSelection(dataset: UploadTreeDatasetItem): ExistingUploadDatasetSelection {
  return {
    uri: dataset.uri,
    rkey: dataset.rkey,
    name: dataset.name,
    description: dataset.description,
    recordCount: dataset.recordCount,
    createdAt: dataset.createdAt,
  };
}

function hasShapeLocation(site: ManagedLocation): boolean {
  return Boolean(
    site.record.location?.kind === "uri" ||
      (site.record.locationType !== null &&
        site.record.locationType !== "point" &&
        site.record.locationType !== "coordinate-decimal"),
  );
}

type BoundaryCandidateStatus = "pending" | "valid" | "invalid";

type FileDropStepProps = {
  uploadId: string;
  did: string;
  initialEstablishmentMeans: string | null;
  initialDatasetSelection: UploadDatasetSelection;
  initialSiteSelection: UploadSiteSelection | null;
  onFileAndMappings: (
    file: File, koboMediaZipFile: File | null, koboMediaZipIndex: KoboMediaZipIndex | null,
    parsedData: Record<string, string>[], headers: string[], mappings: ColumnMapping[],
    establishmentMeans: string | null, datasetSelection: UploadDatasetSelection, siteSelection: UploadSiteSelection,
  ) => void;
};

export default function FileDropStep({
  uploadId, did, initialEstablishmentMeans, initialDatasetSelection, initialSiteSelection, onFileAndMappings,
}: FileDropStepProps) {
  const modal = useModal();
  const { parsedData, headers, rowCount, error, isParsing, parseFile, reset } = useCsvParser();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMediaZipFile, setSelectedMediaZipFile] = useState<File | null>(null);
  const [mediaZipIndex, setMediaZipIndex] = useState<KoboMediaZipIndex | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mediaZipError, setMediaZipError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMediaZipParsing, setIsMediaZipParsing] = useState(false);
  const [establishmentMeans, setEstablishmentMeans] = useState<string | null>(initialEstablishmentMeans);
  const [datasetMode, setDatasetMode] = useState<UploadDatasetSelection["mode"]>(initialDatasetSelection.mode);
  const [datasetName, setDatasetName] = useState(initialDatasetSelection.mode === "new" ? initialDatasetSelection.name : "");
  const [datasetDescription, setDatasetDescription] = useState(initialDatasetSelection.mode === "new" ? initialDatasetSelection.description : "");
  const [selectedExistingDatasetUri, setSelectedExistingDatasetUri] = useState(
    initialDatasetSelection.mode === "existing" ? initialDatasetSelection.dataset.uri : "",
  );
  const [selectedSiteUri, setSelectedSiteUri] = useState<string | null>(initialSiteSelection?.uri ?? null);
  const [defaultSiteUri, setDefaultSiteUri] = useState<string | null>(null);

  // Sites data
  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);

  // Datasets data
  const [existingDatasets, setExistingDatasets] = useState<UploadTreeDatasetItem[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);

  // Site boundary state
  const [selectedSiteBoundaryReady, setSelectedSiteBoundaryReady] = useState(false);
  const [selectedSiteBoundaryLoading, setSelectedSiteBoundaryLoading] = useState(false);
  const [selectedSiteBoundaryFailed, setSelectedSiteBoundaryFailed] = useState(false);
  const [boundaryCandidateStatuses, setBoundaryCandidateStatuses] = useState<Record<string, BoundaryCandidateStatus>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const mediaZipInputRef = useRef<HTMLInputElement>(null);
  const mediaZipParseRequestRef = useRef(0);
  const lastTrackedParseErrorRef = useRef<string | null>(null);

  const loadDefaultSite = useCallback(async () => {
    try {
      const response = await fetch("/api/manage/sites/default");
      const payload = (await response.json()) as { siteUri?: string | null } | { error?: string };
      setDefaultSiteUri(response.ok && "siteUri" in payload ? payload.siteUri ?? null : null);
    } catch {
      setDefaultSiteUri(null);
    }
  }, []);

  const loadSites = useCallback(async (siteUriToSelect?: string) => {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const response = await fetch("/api/manage/sites");
      const payload = (await response.json()) as ManagedLocation[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        setSites([]);
        setSitesError(!Array.isArray(payload) && payload.error ? payload.error : "Failed to load sites.");
        return;
      }
      setSites(payload);
      if (siteUriToSelect && payload.some((site) => site.metadata.uri === siteUriToSelect)) {
        setSelectedSiteUri(siteUriToSelect);
      }
    } catch {
      setSites([]);
      setSitesError("Could not load sites. Try again.");
    } finally {
      setSitesLoading(false);
    }
  }, []);

  // Load sites on mount
  useEffect(() => {
    void loadSites();
    void loadDefaultSite();
  }, [loadDefaultSite, loadSites]);

  // Load existing datasets when mode = "existing"
  useEffect(() => {
    if (datasetMode !== "existing") return;
    setDatasetsLoading(true);
    fetchUploadTreeDatasets()
      .then((data) => { setExistingDatasets(data); setDatasetsLoading(false); })
      .catch(() => { setDatasetsError("Failed to load tree groups."); setDatasetsLoading(false); });
  }, [datasetMode]);

  const uploadSites = useMemo(() => sites.flatMap((s) => { const u = toUploadSiteSelection(s); return u ? [u] : []; }), [sites]);
  const sitesWithBoundary = useMemo(() => getBoundaryCapableUploadSites(uploadSites), [uploadSites]);
  const selectedSite = useMemo(
    () => resolveUploadSiteSelection({ sites: uploadSites, selectedSiteUri, defaultSiteUri }),
    [defaultSiteUri, selectedSiteUri, uploadSites],
  );
  const selectedManagedSite = useMemo(
    () => selectedSite ? sites.find((site) => site.metadata.uri === selectedSite.uri) ?? null : null,
    [selectedSite, sites],
  );
  const selectedSiteHasBoundary = selectedSite ? uploadSiteHasBoundary(selectedSite) : false;
  const selectedSiteBoundarySyncing = selectedSite ? uploadSiteHasTransientBoundary(selectedSite) : false;
  const boundaryCandidateChecksDone = sitesWithBoundary.length > 0 && sitesWithBoundary.every((site) => {
    const status = boundaryCandidateStatuses[site.uri];
    return status === "valid" || status === "invalid";
  });
  const hasValidatedBoundaryCandidate = sitesWithBoundary.some((site) => boundaryCandidateStatuses[site.uri] === "valid");
  const allBoundaryCandidatesFailed = boundaryCandidateChecksDone && !hasValidatedBoundaryCandidate;
  const showCreateSiteBoundaryAction = !selectedSiteBoundarySyncing && shouldOfferCreateUploadSiteBoundary({
    sitesWithBoundary, selectedSite, selectedSiteBoundaryFailed, allBoundaryCandidatesFailed,
  });

  const openSiteBoundaryModal = useCallback((siteToEdit: ManagedLocation | null = null) => {
    modal.pushModal(
      {
        id: siteToEdit ? `${SiteEditorModalId}-upload-${siteToEdit.metadata.rkey}` : `${SiteEditorModalId}-upload-new`,
        dialogWidth: "max-w-lg",
        content: (
          <SiteEditorModal
            did={did}
            requireBoundary={siteToEdit !== null}
            initialData={siteToEdit
              ? {
                  rkey: siteToEdit.metadata.rkey,
                  name: siteToEdit.record.name ?? "",
                  hasShapeLocation: selectedSiteBoundaryFailed ? false : hasShapeLocation(siteToEdit),
                  recordValue: siteToEdit.rawRecord ?? null,
                }
              : null}
            onSaved={(site) => {
              setSelectedSiteUri(site.uri);
              void loadSites(site.uri);
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [did, loadSites, modal, selectedSiteBoundaryFailed]);

  // Validate every existing site boundary so the upload can detect when none can be used.
  useEffect(() => {
    let cancelled = false;

    if (sitesWithBoundary.length === 0) {
      setBoundaryCandidateStatuses({});
      return;
    }

    const initialStatuses: Record<string, BoundaryCandidateStatus> = {};
    for (const site of sitesWithBoundary) initialStatuses[site.uri] = "pending";
    setBoundaryCandidateStatuses(initialStatuses);
    for (const site of sitesWithBoundary) {
      void fetchUploadSiteBoundary(site)
        .then(() => {
          if (cancelled) return;
          setBoundaryCandidateStatuses((prev) => ({ ...prev, [site.uri]: "valid" }));
        })
        .catch(() => {
          if (cancelled) return;
          setBoundaryCandidateStatuses((prev) => ({ ...prev, [site.uri]: "invalid" }));
        });
    }

    return () => { cancelled = true; };
  }, [sitesWithBoundary]);

  // Validate site boundary when selectedSite changes
  useEffect(() => {
    let cancelled = false;
    if (!selectedSite || !selectedSiteHasBoundary || selectedSiteBoundarySyncing) {
      setSelectedSiteBoundaryReady(false);
      setSelectedSiteBoundaryFailed(false);
      setSelectedSiteBoundaryLoading(false);
      return;
    }
    setSelectedSiteBoundaryLoading(true);
    setSelectedSiteBoundaryReady(false);
    setSelectedSiteBoundaryFailed(false);
    fetchUploadSiteBoundary(selectedSite)
      .then(() => {
        if (cancelled) return;
        setSelectedSiteBoundaryReady(true);
        setSelectedSiteBoundaryLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedSiteBoundaryFailed(true);
        setSelectedSiteBoundaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedSite, selectedSiteHasBoundary, selectedSiteBoundarySyncing]);

  const selectedExistingDataset = useMemo(() => {
    const match = existingDatasets.find((d) => d.uri === selectedExistingDatasetUri);
    return match ? toExistingDatasetSelection(match) : null;
  }, [existingDatasets, selectedExistingDatasetUri]);

  const handleFile = useCallback((file: File) => {
    setFileError(null);
    if (!isAcceptedFile(file)) {
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FILE_REJECTED, {
        uploadId,
        fileExtension: getFileExtension(file.name),
        fileSizeBucket: getFileSizeBucket(file.size),
        failureReason: "unsupported_file_type",
      });
      setFileError("Only spreadsheet export files are supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FILE_REJECTED, {
        uploadId,
        fileExtension: getFileExtension(file.name),
        fileSizeBucket: getFileSizeBucket(file.size),
        failureReason: "file_too_large",
      });
      setFileError(`File too large (${formatBytes(file.size)}). Max 10 MB.`);
      return;
    }
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FILE_ACCEPTED, {
      uploadId,
      fileExtension: getFileExtension(file.name),
      fileSizeBucket: getFileSizeBucket(file.size),
    });
    lastTrackedParseErrorRef.current = null;
    reset();
    setSelectedFile(file);
    parseFile(file);
  }, [parseFile, reset, uploadId]);

  const handleMediaZipFile = useCallback(async (file: File) => {
    const requestId = ++mediaZipParseRequestRef.current;
    setMediaZipError(null);
    setMediaZipIndex(null);
    setSelectedMediaZipFile(null);
    setIsMediaZipParsing(false);
    if (!isAcceptedMediaZipFile(file)) {
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.MEDIA_ZIP_REJECTED, {
        uploadId,
        fileExtension: getFileExtension(file.name),
        mediaZipSizeBucket: getFileSizeBucket(file.size),
        failureReason: "unsupported_media_zip_type",
      });
      setMediaZipError("Choose the photo folder file downloaded from your field form app.");
      return;
    }
    setIsMediaZipParsing(true);
    try {
      const index = await buildKoboMediaZipIndex(file);
      if (mediaZipParseRequestRef.current !== requestId) return;
      if (index.entries.length === 0) {
        trackTreeUploadEvent(TREE_UPLOAD_EVENTS.MEDIA_ZIP_REJECTED, {
          uploadId,
          fileExtension: getFileExtension(file.name),
          mediaZipSizeBucket: getFileSizeBucket(file.size),
          mediaZipImageCount: 0,
          mediaZipSubmissionCount: index.submissionCount,
          failureReason: "media_zip_no_supported_images",
        });
        setMediaZipError("This photo folder contains no supported images.");
        return;
      }
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.MEDIA_ZIP_ACCEPTED, {
        uploadId,
        fileExtension: getFileExtension(file.name),
        mediaZipSizeBucket: getFileSizeBucket(file.size),
        mediaZipImageCount: index.entries.length,
        mediaZipSubmissionCount: index.submissionCount,
      });
      setSelectedMediaZipFile(file);
      setMediaZipIndex(index);
    } catch (zipReadError) {
      if (mediaZipParseRequestRef.current !== requestId) return;
      trackTreeUploadEvent(TREE_UPLOAD_EVENTS.MEDIA_ZIP_REJECTED, {
        uploadId,
        fileExtension: getFileExtension(file.name),
        mediaZipSizeBucket: getFileSizeBucket(file.size),
        failureReason: "media_zip_read_failed",
      });
      setMediaZipError(plainPhotoFolderReadError(zipReadError));
    } finally {
      if (mediaZipParseRequestRef.current === requestId) setIsMediaZipParsing(false);
    }
  }, [uploadId]);

  useEffect(() => {
    if (!error || lastTrackedParseErrorRef.current === error) return;
    lastTrackedParseErrorRef.current = error;
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FILE_REJECTED, {
      uploadId,
      fileExtension: selectedFile ? getFileExtension(selectedFile.name) : undefined,
      fileSizeBucket: selectedFile ? getFileSizeBucket(selectedFile.size) : undefined,
      failureReason: "parse_error",
    });
  }, [error, selectedFile, uploadId]);

  const handleContinue = () => {
    if (!selectedFile || parsedData.length === 0 || !selectedSite) return;
    const koboResult = detectKoboFormat(headers);
    const mappings = koboResult.isKobo ? koboResult.mappings : autoDetectMappings(headers);
    const datasetSelection: UploadDatasetSelection =
      datasetMode === "new"
        ? { mode: "new", name: datasetName.trim(), description: datasetDescription.trim() }
        : datasetMode === "existing" && selectedExistingDataset
        ? { mode: "existing", dataset: selectedExistingDataset }
        : { mode: "none" };
    onFileAndMappings(selectedFile, selectedMediaZipFile, mediaZipIndex, parsedData, headers, mappings, establishmentMeans, datasetSelection, selectedSite);
    trackTreeUploadEvent(TREE_UPLOAD_EVENTS.STEP_COMPLETED, {
      uploadId,
      stepIndex: 1,
      stepName: "file",
      datasetMode: datasetSelection.mode,
      sourceFormat: koboResult.isKobo ? "kobo" : "generic",
      fileExtension: getFileExtension(selectedFile.name),
      fileSizeBucket: getFileSizeBucket(selectedFile.size),
      totalRows: parsedData.length,
      totalColumns: headers.length,
      mappedColumns: mappings.length,
      skippedColumns: headers.length - mappings.length,
      hasKoboZip: selectedMediaZipFile !== null,
      mediaZipImageCount: mediaZipIndex?.entries.length,
      mediaZipSubmissionCount: mediaZipIndex?.submissionCount,
    });
  };

  const isParsed = selectedFile !== null && !isParsing && parsedData.length > 0;
  const canContinue =
    isParsed && !error && !fileError && !mediaZipError && !isMediaZipParsing &&
    selectedSite !== null && selectedSiteBoundaryReady &&
    (datasetMode !== "new" || datasetName.trim().length > 0) &&
    (datasetMode !== "existing" || selectedExistingDataset !== null);
  const hasUnavailableSiteSelection = selectedSiteUri !== null && !sitesLoading && !sitesError && selectedSite === null;

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div>
        <h2 className="text-lg font-semibold">Choose your tree file</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Drag and drop a spreadsheet export file, or click to browse.</p>
      </div>

      <div className="space-y-3">
        <TreeDataGuide />
        <KoboExportGuide />
      </div>

      <div
        className={cn(
          "cursor-pointer rounded-xl border-2 border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30",
        )}
        onClick={() => inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          {isParsing ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Reading file…</span>
            </div>
          ) : selectedFile && isParsed ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="h-10 w-10 text-primary" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-10 w-10" />
              <span className="text-sm font-medium">Drag & drop or click to browse</span>
              <span className="text-xs">Spreadsheet export, max 10 MB</span>
            </div>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      {fileError && <p className="text-sm text-destructive">{fileError}</p>}
      {error && <p className="text-sm text-destructive">Could not read file: {error}</p>}

      {isParsed && !error && !fileError && (
        <div className="rounded-md border border-border bg-muted/30 p-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div><span className="block font-medium text-foreground text-sm">{rowCount.toLocaleString()}</span>rows</div>
          <div><span className="block font-medium text-foreground text-sm">{headers.length}</span>file headings</div>
          <div><span className="block font-medium text-foreground text-sm">{detectKoboFormat(headers).isKobo ? "Field form" : "Spreadsheet"}</span>file type</div>
        </div>
      )}

      {/* Kobo media ZIP */}
      <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-medium">Photo folder (optional)</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">If your field form export includes photos, choose the matching photo folder to include them.</p>
        </div>
        <div
          className="cursor-pointer rounded-lg border border-dashed bg-background transition-colors hover:border-primary/60 hover:bg-muted/30"
          onClick={() => mediaZipInputRef.current?.click()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {isMediaZipParsing ? (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <div>
                  <p className="text-sm font-medium">Reading photo folder…</p>
                  <p className="text-xs">Large photo folders can take a few minutes. Keep this page open.</p>
                </div>
              </div>
            ) : selectedMediaZipFile && mediaZipIndex ? (
              <div className="flex min-w-0 items-center gap-3">
                <Archive className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedMediaZipFile.name}</p>
                  <p className="text-xs text-muted-foreground">{mediaZipIndex.entries.length} images, {mediaZipIndex.submissionCount} submissions</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Archive className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Click to select photo folder</p>
                  <p className="text-xs">Large photo folders are supported. Only matched photos will be uploaded.</p>
                </div>
              </div>
            )}
            {(selectedMediaZipFile || mediaZipError) && (
              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); mediaZipParseRequestRef.current++; setSelectedMediaZipFile(null); setMediaZipIndex(null); setMediaZipError(null); }}>
                <X className="h-4 w-4" />
                {selectedMediaZipFile ? "Remove" : "Clear"}
              </Button>
            )}
          </div>
        </div>
        <input ref={mediaZipInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMediaZipFile(f); e.target.value = ""; }} />
        {mediaZipError && <p className="text-sm text-destructive">{mediaZipError}</p>}
      </div>

      {/* Site selection (required) */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <div>
          <label htmlFor="site-select" className="text-sm font-medium">Site boundary <span className="text-destructive">*</span></label>
          <p className="text-xs text-muted-foreground mt-0.5">Each upload uses one site boundary. Trees outside its drawn map area will be skipped.</p>
        </div>
        {sitesLoading ? (
          <Skeleton className="h-9 w-full rounded-md" />
        ) : sitesError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{sitesError}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadSites()}>
                Retry
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => openSiteBoundaryModal()}>
                <CirclePlus className="h-4 w-4" />
                Add site boundary
              </Button>
            </div>
          </div>
        ) : uploadSites.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">No sites yet. Add a site boundary here to keep going.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => openSiteBoundaryModal()}>
              <CirclePlus className="h-4 w-4" />
              Add site boundary
            </Button>
          </div>
        ) : (
          <>
            <Select value={selectedSite?.uri ?? ""} onValueChange={setSelectedSiteUri}>
              <SelectTrigger id="site-select">
                <SelectValue placeholder="Select a site…" />
              </SelectTrigger>
              <SelectContent>
                {uploadSites.map((site) => {
                  const hasBoundary = uploadSiteHasBoundary(site);
                  const isSyncing = uploadSiteHasTransientBoundary(site);
                  const isDefault = defaultSiteUri === site.uri;
                  return (
                    <SelectItem key={site.uri} value={site.uri} disabled={isSyncing}>
                      {site.name}
                      {isDefault ? " (default)" : ""}
                      {isSyncing ? " — preparing map area…" : !hasBoundary ? " — needs map area" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => openSiteBoundaryModal()}>
                <CirclePlus className="h-4 w-4" />
                Add site boundary
              </Button>
              {selectedManagedSite && (!selectedSiteHasBoundary || selectedSiteBoundaryFailed) && (
                <Button type="button" variant="outline" size="sm" onClick={() => openSiteBoundaryModal(selectedManagedSite)}>
                  Add map area to selected site
                </Button>
              )}
            </div>
            {selectedSite && (
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <p className="font-medium text-foreground">{selectedSite.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Trees will be checked against this one drawn map area.</p>
              </div>
            )}
            {selectedSiteBoundarySyncing && (
              <p className="text-sm text-muted-foreground">This drawn map area is still being prepared. Try again in a moment.</p>
            )}
            {selectedSite && selectedSiteHasBoundary && selectedSiteBoundaryLoading && (
              <p className="text-xs text-muted-foreground">Checking drawn map area…</p>
            )}
            {selectedSite && selectedSiteHasBoundary && selectedSiteBoundaryFailed && (
              <p className="text-sm text-destructive">Could not load this drawn map area. Add a new area to the selected site or choose another site boundary.</p>
            )}
            {allBoundaryCandidatesFailed && (
              <p className="text-sm text-destructive">None of the existing drawn map areas could be checked. Add a new site boundary or replace one before continuing.</p>
            )}
            {hasUnavailableSiteSelection && (
              <p className="text-sm text-destructive">The selected site is no longer available. Choose another site boundary.</p>
            )}
            {selectedSite && !selectedSiteHasBoundary && !selectedSiteBoundarySyncing && (
              <p className="text-sm text-destructive">This site has no drawn map area. Add one here before continuing.</p>
            )}
            {!selectedSite && !hasUnavailableSiteSelection && (
              <p className="text-sm text-muted-foreground">Choose one site for this upload, then add a drawn map area if needed. If the file covers more than one site, split it into separate uploads.</p>
            )}
            {showCreateSiteBoundaryAction && (
              <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {allBoundaryCandidatesFailed ? "No usable site boundaries found" : "Need a site boundary?"}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {allBoundaryCandidatesFailed
                      ? "Add a new site boundary or replace the selected drawn map area so trees can be checked before upload."
                      : "Add a site boundary here without leaving the upload."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openSiteBoundaryModal()}>
                    <CirclePlus className="h-4 w-4" />
                    Add site boundary
                  </Button>
                  {selectedManagedSite && (allBoundaryCandidatesFailed || !selectedSiteHasBoundary || selectedSiteBoundaryFailed) && (
                    <Button type="button" variant="outline" size="sm" onClick={() => openSiteBoundaryModal(selectedManagedSite)}>
                      Replace selected map area
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dataset selection */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Tree group</label>
          <p className="text-xs text-muted-foreground mt-0.5">Optionally group these trees together.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {([
            { mode: "none" as const, title: "No group", description: "Add trees without grouping them." },
            { mode: "new" as const, title: "Create new group", description: "Create a named group for these trees." },
            { mode: "existing" as const, title: "Add to existing", description: "Add trees to an existing group." },
          ]).map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={() => setDatasetMode(option.mode)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                datasetMode === option.mode ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/30",
              )}
            >
              <p className="text-sm font-medium">{option.title}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{option.description}</p>
            </button>
          ))}
        </div>

        {datasetMode === "new" && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="space-y-1.5">
              <label htmlFor="dataset-name" className="text-sm font-medium">Group name <span className="text-destructive">*</span></label>
              <Input id="dataset-name" value={datasetName} onChange={(e) => setDatasetName(e.target.value)} placeholder="e.g. Amazon Plot Survey 2024" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dataset-desc" className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea id="dataset-desc" value={datasetDescription} onChange={(e) => setDatasetDescription(e.target.value)} placeholder="Describe this group…" rows={2} className="resize-none" />
            </div>
          </div>
        )}

        {datasetMode === "existing" && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div>
              <label className="text-sm font-medium">Choose group</label>
              <p className="text-xs text-muted-foreground mt-0.5">Trees will be added to this group.</p>
            </div>
            {datasetsLoading ? (
              <Skeleton className="h-9 w-full rounded-md" />
            ) : datasetsError ? (
              <p className="text-sm text-destructive">{datasetsError}</p>
            ) : existingDatasets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups found. Create one first.</p>
            ) : (
              <>
                <Select value={selectedExistingDatasetUri} onValueChange={setSelectedExistingDatasetUri}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingDatasets.map((d) => (
                      <SelectItem key={d.uri} value={d.uri}>
                        {d.name} ({d.recordCount ?? 0} trees)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedExistingDataset && (
                  <div className="rounded-lg border border-border bg-background p-3 text-sm">
                    <p className="font-medium">{selectedExistingDataset.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{selectedExistingDataset.description ?? "No description"}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Establishment means */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">How were these trees established? <span className="text-muted-foreground font-normal">(optional)</span></label>
          <p className="text-xs text-muted-foreground mt-0.5">This describes how trees came to be at this site.</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          {PARTNER_ESTABLISHMENT_MEANS_OPTIONS.map((option) => {
            const isSelected = establishmentMeans === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setEstablishmentMeans(isSelected ? null : option.value)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
                  isSelected ? "bg-primary/10" : "bg-background hover:bg-muted/30",
                )}
              >
                <span className={cn("mt-1 flex size-4 shrink-0 rounded-full border transition-colors", isSelected ? "border-primary bg-primary" : "border-muted-foreground/40 bg-background")} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-mono">{option.gbifCodeLabel}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end pt-2 border-t border-border">
        <Button onClick={handleContinue} disabled={!canContinue}>
          Continue to match headings
        </Button>
      </div>
    </div>
  );
}
