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

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PencilIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";

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
 * Delete a folder and everything filed in it. Emptying the folder first and
 * leaving it behind would only strand the recordings, so the dialog is
 * explicit about the recordings going too.
 */
export function DeleteFolderModal({
  name,
  count,
  onConfirm,
}: {
  name: string;
  /** Recordings in the folder — all of them go with it. */
  count: number;
  onConfirm: (onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const t = useTranslations("common.recordingFolders");
  const close = useCloseModal();
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
