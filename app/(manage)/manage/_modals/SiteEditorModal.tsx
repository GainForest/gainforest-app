"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, CheckIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { createRecord, putRecord, uploadBlob } from "../_lib/mutations";
import { validateGeojsonOrThrow } from "../_lib/upload/geojson";
import { DrawPolygonModal, DrawPolygonModalId } from "./DrawPolygonModal";

export const SiteEditorModalId = "site-editor";
const POLYGONS_APP_URL = "https://polygons-gainforest.vercel.app";
const MAX_SITE_FILE_BYTES = 10 * 1024 * 1024;

export type SavedSiteRef = {
  uri: string;
  cid: string;
  rkey: string;
  name: string;
};

type SiteEditorModalProps = {
  did: string;
  // null = create mode; object = edit mode
  initialData?: {
    rkey: string;
    name: string;
    hasShapeLocation: boolean;
    recordValue?: Record<string, unknown> | null;
  } | null;
  onSaved?: (site: SavedSiteRef) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type UploadedBlobLike = {
  ref?: unknown;
  mimeType?: unknown;
  size?: unknown;
  blob?: unknown;
};

function toLexBlobRef(uploaded: UploadedBlobLike, file: File) {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("Could not save the site file. Please try again.");
  }
  return {
    $type: "blob" as const,
    ref: raw.ref,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : (file.type || "application/geo+json"),
    size: typeof raw.size === "number" ? raw.size : file.size,
  };
}

async function validateSiteFile(file: File): Promise<void> {
  if (file.size > MAX_SITE_FILE_BYTES) {
    throw new Error("Choose a smaller site file (max 10 MB).");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Choose a valid map file.");
  }
  try {
    validateGeojsonOrThrow(parsed);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message.replace(/GeoJSON/gi, "map file") : "Choose a valid map file.");
  }
}

export function SiteEditorModal({ did, initialData, onSaved }: SiteEditorModalProps) {
  const isEditMode = Boolean(initialData?.rkey);
  const previewUrl =
    isEditMode && initialData?.hasShapeLocation
      ? `${POLYGONS_APP_URL}/view?certifiedLocationRecordUri=${encodeURIComponent(
          `at://${did}/app.certified.location/${initialData.rkey}`,
        )}`
      : undefined;

  const [name, setName] = useState(initialData?.name ?? "");
  const [siteFile, setSiteFile] = useState<File | null>(null);
  const [showEditor, setShowEditor] = useState(!isEditMode || !previewUrl);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { stack, popModal, hide, pushModal, show } = useModal();

  const handleDrawDone = useCallback((geojsonString: string) => {
    const blob = new Blob([geojsonString], { type: "application/geo+json" });
    setSiteFile(new File([blob], "drawn-site.geojson", { type: "application/geo+json" }));
    setError(null);
  }, []);

  const openDrawModal = () => {
    pushModal({
      id: DrawPolygonModalId,
      dialogWidth: "max-w-2xl",
      content: <DrawPolygonModal onSubmit={handleDrawDone} />,
    });
    void show();
  };

  const disableSubmit = !name.trim() || (!isEditMode && !siteFile) || isPending;

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    if (!isEditMode && !siteFile) { setError("Upload a site file or draw a site."); return; }
    setIsPending(true);
    setError(null);
    try {
      let result: { uri: string; cid: string };
      if (!isEditMode) {
        if (!siteFile) return;
        await validateSiteFile(siteFile);
        const uploaded = await uploadBlob(siteFile);
        result = await createRecord("app.certified.location", {
          $type: "app.certified.location",
          lpVersion: "1.0.0",
          srs: "https://epsg.io/3857",
          locationType: "geojson-point",
          location: { $type: "org.hypercerts.defs#smallBlob", blob: toLexBlobRef(uploaded, siteFile) },
          name: name.trim(),
          createdAt: new Date().toISOString(),
        });
      } else {
        const rkey = initialData!.rkey;
        const record: Record<string, unknown> = {
          ...(initialData?.recordValue ?? {}),
          $type: "app.certified.location",
          name: name.trim(),
        };
        if (typeof record.createdAt !== "string") {
          record.createdAt = new Date().toISOString();
        }
        if (siteFile) {
          await validateSiteFile(siteFile);
          const uploaded = await uploadBlob(siteFile);
          record.lpVersion = "1.0.0";
          record.srs = "https://epsg.io/3857";
          record.locationType = "geojson-point";
          record.location = { $type: "org.hypercerts.defs#smallBlob", blob: toLexBlobRef(uploaded, siteFile) };
        }
        result = await putRecord("app.certified.location", rkey, record);
      }
      const rkey = result.uri.split("/").pop() ?? (initialData?.rkey ?? "site");
      onSaved?.({ uri: result.uri, cid: result.cid, rkey, name: name.trim() });
      setIsCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save site.");
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = () => {
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      popModal();
    }
  };

  return (
    <ModalContent>
      <ModalHeader backAction={stack.length === 1 ? undefined : () => popModal()}>
        <ModalTitle>{isEditMode ? "Edit site" : "Add site"}</ModalTitle>
        <ModalDescription>
          {isEditMode
            ? "Update the site name or replace its boundary."
            : "Add a new certified field location."}
        </ModalDescription>
      </ModalHeader>

      <AnimatePresence mode="wait">
        {!isCompleted ? (
          <motion.section
            key="form"
            className="w-full"
            exit={{ opacity: 0, filter: "blur(10px)", scale: 0.5 }}
          >
            <div className="mt-4 flex w-full flex-col">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="site-editor-name" className="text-sm text-muted-foreground">
                  Name
                </label>
                <Input
                  id="site-editor-name"
                  placeholder="e.g. North restoration plot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <hr className="my-4 opacity-50" />

            {!showEditor && previewUrl && (
              <div className="relative mt-4">
                <iframe
                  src={previewUrl}
                  className="h-64 w-full rounded-lg border border-border"
                  title="Site preview"
                />
                <Button
                  size="sm"
                  className="absolute right-3 top-3"
                  variant="outline"
                  onClick={() => setShowEditor(true)}
                >
                  Edit
                </Button>
              </div>
            )}

            {showEditor && (
              <>
                {isEditMode && (
                  <Button
                    variant="ghost"
                    aria-label="Back"
                    className="-ml-2"
                    onClick={() => setShowEditor(false)}
                  >
                    <ArrowLeftIcon />
                  </Button>
                )}
                <div className="mt-2 flex flex-col gap-3">
                  <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/35 px-5 py-4 text-center transition-colors hover:border-primary/40 hover:bg-primary/5">
                    <input
                      type="file"
                      accept=".geojson,.json,application/geo+json,application/json"
                      className="sr-only"
                      onChange={(e) => {
                        setSiteFile(e.target.files?.[0] ?? null);
                        setError(null);
                        e.target.value = "";
                      }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {siteFile ? siteFile.name : "Upload a map file"}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {siteFile
                        ? "Click to replace"
                        : "Choose a saved map boundary file"}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <Button variant="outline" className="w-full" onClick={openDrawModal}>
                    <PencilIcon className="mr-2 size-4" />
                    Draw site
                  </Button>
                </div>
              </>
            )}

            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </motion.section>
        ) : (
          <motion.section
            key="completed"
            className="flex h-40 w-full flex-col items-center justify-center rounded-lg border border-border p-4"
            initial={{ opacity: 0, filter: "blur(10px)", scale: 0.5 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              <CheckIcon className="size-6 text-white" />
            </div>
            <span className="mt-2 text-lg font-medium">
              {isEditMode ? "Site updated!" : "Site added!"}
            </span>
          </motion.section>
        )}
      </AnimatePresence>

      <ModalFooter>
        {!isCompleted ? (
          <Button onClick={() => void handleSave()} disabled={disableSubmit}>
            {isPending && <Loader2Icon className="mr-2 animate-spin" />}
            {isEditMode
              ? isPending ? "Saving…" : "Save"
              : isPending ? "Adding…" : "Add"}
          </Button>
        ) : (
          <Button onClick={handleClose}>Close</Button>
        )}
      </ModalFooter>
    </ModalContent>
  );
}
