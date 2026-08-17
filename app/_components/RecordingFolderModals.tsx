"use client";

/**
 * Rename and delete dialogs for a folder of recordings (an `ac.deployment`).
 *
 * A folder is named once, in a hurry, while an SD card is uploading — so it
 * is usually the first thing someone wants to fix. Both dialogs are shared by
 * the profile's Audio tab and the soundscape page so a folder is managed the
 * same way wherever it is shown.
 *
 * These render inside the root modal host, so they take plain props and no
 * page-level context.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FolderInputIcon, Loader2Icon, PencilIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import {
  UploadFolderPicker,
  type UploadFolderOptionItem,
} from "@/app/audiomoth/_components/UploadFolderPicker";
import { activeUploadFolderMode, type UploadFolderMode } from "@/app/_lib/audiomoth/upload-folder";
import { LocationEditorModal } from "@/app/(manage)/manage/_modals/LocationEditorModal";

const FOLDER_NAME_MAX = 120;

function useCloseModal() {
  const modal = useModal();
  return async () => {
    await modal.hide();
    modal.popModal();
  };
}

/** Change a folder's name. The recordings inside it are untouched. */
export function RenameFolderModal({
  currentName,
  onSave,
}: {
  currentName: string;
  /** Persists the new name; rejects with a message worth showing. */
  onSave: (name: string) => Promise<void>;
}) {
  const t = useTranslations("common.recordingFolders");
  const close = useCloseModal();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const unchanged = trimmed === currentName.trim();

  const save = async () => {
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      await close();
    } catch (renameError) {
      setError(renameError instanceof Error && renameError.message ? renameError.message : t("renameFailed"));
      setSaving(false);
    }
  };

  return (
    <ModalContent dismissible={!saving} className="space-y-4">
      <ModalHeader>
        <ModalTitle>{t("renameTitle")}</ModalTitle>
        <ModalDescription>{t("renameBody")}</ModalDescription>
      </ModalHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recording-folder-name">{t("nameLabel")}</Label>
        <Input
          id="recording-folder-name"
          value={name}
          autoFocus
          maxLength={FOLDER_NAME_MAX}
          disabled={saving}
          placeholder={t("namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) void save();
          }}
        />
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={() => void close()}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={saving || !trimmed || unchanged} onClick={() => void save()}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <PencilIcon className="size-4" />}
          {saving ? t("saving") : t("save")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

/**
 * Set or correct where a deployment's recorder stood — the manual override
 * for deployments that came in by uploading past SD-card audio, which the
 * chime flow never asked coordinates for.
 *
 * A thin skin over the one location editor the app already has (the
 * organization-location modal): search for the place, enter coordinates by
 * hand, drag the pin to fine-tune. Deployment coordinates are a measurement,
 * so the editor runs in exact-point mode — no "approximate location"
 * fuzzing, no Remove, and every pick carries exact coordinates.
 */
export function SetDeploymentLocationModal({
  name,
  initial,
  onSave,
}: {
  /** The deployment's display name, for the dialog copy. */
  name: string;
  /** The currently stored coordinates, when the deployment has any. */
  initial: { lat: number; lon: number } | null;
  /** Persists the override; rejects with a message worth showing. */
  onSave: (location: { lat: number; lon: number }) => Promise<void>;
}) {
  const t = useTranslations("common.recordingFolders");
  return (
    <LocationEditorModal
      title={t("locationTitle")}
      description={t("locationBody", { name })}
      pointOnly
      current={
        initial
          ? {
              name: `${initial.lat.toFixed(5)}, ${initial.lon.toFixed(5)}`,
              countryCode: null,
              latitude: initial.lat,
              longitude: initial.lon,
            }
          : null
      }
      onConfirm={async (choice) => {
        // pointOnly never confirms with null (Remove is hidden).
        if (!choice) return;
        await onSave({ lat: choice.place.latitude, lon: choice.place.longitude });
      }}
    />
  );
}

/**
 * Counts the identifications a delete would take with it, for the dialog's
 * warning. The listing can be slow on a big repo and can fail outright, so it
 * only ever *adds* a number to a warning that already says identifications go
 * — it never gates the button.
 */
function useIdentificationCount(count: (() => Promise<number>) | undefined): number | null {
  const [identifications, setIdentifications] = useState<number | null>(null);
  useEffect(() => {
    if (!count) return;
    let cancelled = false;
    count()
      .then((value) => {
        if (!cancelled) setIdentifications(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [count]);
  return identifications;
}

/** The "… including N identifications" line, once the count is in. */
function IdentificationNote({ count }: { count: number | null }) {
  const t = useTranslations("common.recordingFolders");
  if (count === null || count === 0) return null;
  return (
    <p className="rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
      {t("identificationsIncluded", { count })}
    </p>
  );
}

/**
 * Delete a folder and everything filed in it. Emptying the folder first and
 * leaving it behind would only strand the recordings, so the dialog is
 * explicit about the recordings — and the identifications drawn on them —
 * going too.
 */
export function DeleteFolderModal({
  name,
  count,
  countIdentifications,
  onConfirm,
}: {
  name: string;
  /** Recordings in the folder — all of them go with it. */
  count: number;
  /** Resolves how many identifications are drawn on those recordings. */
  countIdentifications?: () => Promise<number>;
  onConfirm: (onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const t = useTranslations("common.recordingFolders");
  const close = useCloseModal();
  const identifications = useIdentificationCount(countIdentifications);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm((done, total) => setProgress({ done, total }));
      await close();
    } catch (deleteError) {
      setError(deleteError instanceof Error && deleteError.message ? deleteError.message : t("deleteFailed"));
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        {/* The folder's name is user-supplied and can be long, so the text
            wraps beside the icon and clears the dialog's close button. */}
        <ModalTitle className="flex items-start gap-2 pr-8">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlertIcon className="size-4.5" />
          </span>
          <span className="min-w-0 break-words">{t("deleteTitle", { name })}</span>
        </ModalTitle>
        <ModalDescription>{t("deleteBody", { count })}</ModalDescription>
      </ModalHeader>
      <IdentificationNote count={identifications} />
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>
          {t("cancel")}
        </Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {pending && progress ? t("deleteProgress", { done: progress.done, total: progress.total }) : t("deleteAction")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

/** Where a selection of recordings should end up. */
export type MoveRecordingsTarget =
  | { kind: "existing"; uri: string }
  | { kind: "new"; name: string };

/**
 * Move the selected recordings into another folder.
 *
 * Recordings are filed by the folder that happened to be picked while the SD
 * card uploaded, which is often wrong afterwards: two sites on one card, or a
 * card emptied into the previous site's folder. The destination is chosen with
 * the very same picker the uploader uses — an existing folder or a new one —
 * so "where do these recordings go?" is answered the same way in both places.
 */
export function MoveRecordingsModal({
  count,
  folders,
  counts,
  onMove,
}: {
  /** How many recordings are being moved. */
  count: number;
  /** The account's folders; null while they are still loading. */
  folders: UploadFolderOptionItem[] | null;
  /** Recordings already in each folder, keyed by folder AT-URI. */
  counts: Map<string, number>;
  onMove: (target: MoveRecordingsTarget, onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const t = useTranslations("common.recordingFolders");
  const close = useCloseModal();
  const [mode, setMode] = useState<UploadFolderMode>("existing");
  const [selectedUri, setSelectedUri] = useState("");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMode = activeUploadFolderMode(mode, folders?.length ?? 0);
  const target: MoveRecordingsTarget | null =
    activeMode === "existing"
      ? selectedUri
        ? { kind: "existing", uri: selectedUri }
        : null
      : newName.trim()
        ? { kind: "new", name: newName.trim() }
        : null;

  const move = async () => {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      await onMove(target, (done, total) => setProgress({ done, total }));
      await close();
    } catch (moveError) {
      setError(moveError instanceof Error && moveError.message ? moveError.message : t("moveFailed"));
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle>{t("moveTitle", { count })}</ModalTitle>
        <ModalDescription>{t("moveBody")}</ModalDescription>
      </ModalHeader>
      {/* The uploader's own destination picker, so both places look and
          behave identically. */}
      <UploadFolderPicker
        folders={folders}
        counts={counts}
        mode={mode}
        onModeChange={setMode}
        selectedUri={selectedUri}
        onSelect={setSelectedUri}
        query={query}
        onQueryChange={setQuery}
        newName={newName}
        onNewNameChange={setNewName}
      />
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={pending || !target} onClick={() => void move()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <FolderInputIcon className="size-4" />}
          {pending && progress ? t("moveProgress", { done: progress.done, total: progress.total }) : t("moveAction")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
