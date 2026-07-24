"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { Dialog, DialogDescription, DialogFooter, DialogPlaceholder, DialogTitle } from "@/components/ui/modal/dialog";
import { debug } from "@/lib/logger";

type StackedConfirmProps = {
  open?: never;
  onOpenChange?: never;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void | Promise<void>;
};

type ControlledConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isPending?: never;
  onConfirm: () => void | Promise<void>;
};

export type ManageConfirmModalProps = StackedConfirmProps | ControlledConfirmProps;

function StackedConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  isPending = false,
  onConfirm,
}: StackedConfirmProps) {
  const modal = useModal();
  const actionsT = useTranslations("upload.actions");
  const resolvedConfirmLabel = confirmLabel ?? actionsT("confirm");
  const resolvedCancelLabel = cancelLabel ?? actionsT("cancel");
  const close = async () => {
    await modal.hide();
    modal.popModal();
  };
  return (
    <ModalContent dismissible={!isPending} className="space-y-4">
      <ModalHeader>
        <ModalTitle className="font-instrument font-light italic">{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => void close()}>{resolvedCancelLabel}</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} disabled={isPending} onClick={() => void onConfirm()}>
          {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
          {resolvedConfirmLabel}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function ControlledConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onOpenChange,
  onConfirm,
}: ControlledConfirmProps) {
  const actionsT = useTranslations("upload.actions");
  const resolvedConfirmLabel = confirmLabel ?? actionsT("confirm");
  const resolvedCancelLabel = cancelLabel ?? actionsT("cancel");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [open, title, description, confirmLabel]);

  const handleConfirm = async () => {
    setIsPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      debug.error("Manage confirmation failed", caught);
      setError(actionsT("failed"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogPlaceholder dialogWidth="max-w-md">
        <div className="space-y-2">
          <DialogTitle className="font-instrument font-light italic">{title}</DialogTitle>
          {typeof description === "string" ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription asChild><div>{description}</div></DialogDescription>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{resolvedCancelLabel}</Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={() => void handleConfirm()} disabled={isPending}>
            {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
            {resolvedConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogPlaceholder>
    </Dialog>
  );
}

export function ManageConfirmModal(props: ManageConfirmModalProps) {
  return "open" in props && typeof props.open === "boolean"
    ? <ControlledConfirmModal {...props} />
    : <StackedConfirmModal {...props} />;
}
