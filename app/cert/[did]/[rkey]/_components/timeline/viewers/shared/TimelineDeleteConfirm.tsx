"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ControlledModal } from "@/components/ui/modal/controlled-modal";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";

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
    <ControlledModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) onCancel();
      }}
      dialogWidth="max-w-md"
      role="alertdialog"
    >
      <ModalContent dismissible={!isDeleting} className="space-y-4">
        <ModalHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="h-5 w-5" />
          </div>
          <ModalTitle className="pr-10">{t("title")}</ModalTitle>
          <ModalDescription>{t("body", { title })}</ModalDescription>
        </ModalHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <ModalFooter className="sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
            {isDeleting ? t("removing") : t("remove")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ControlledModal>
  );
}
