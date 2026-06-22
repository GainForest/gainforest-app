"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPlaceholder,
  DialogTitle,
} from "@/components/ui/modal/dialog";

export function TimelineDeleteConfirm({
  open,
  title,
  onConfirm,
  onCancel,
  isDeleting,
  error,
}: {
  open: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  error: string | null;
}) {
  const t = useTranslations("bumicert.detail.timelineEntry.deleteConfirm");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) onCancel();
      }}
    >
      <DialogPlaceholder role="alertdialog" dialogWidth="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="h-5 w-5" />
          </div>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body", { title })}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter className="sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
            {isDeleting ? t("removing") : t("remove")}
          </Button>
        </DialogFooter>
      </DialogPlaceholder>
    </Dialog>
  );
}
