"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlledModal } from "@/components/ui/modal/controlled-modal";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/modal/modal";

type ManageConfirmModalProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
};

export function ManageConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  onOpenChange,
  onConfirm,
}: ManageConfirmModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [open, title, description, confirmLabel]);

  const handleConfirm = async () => {
    setIsPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action could not be finished.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ControlledModal
      open={open}
      onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}
      dialogWidth="max-w-md"
    >
      <ModalContent dismissible={!isPending} className="space-y-4">
        <div className="space-y-2">
          <ModalTitle className="pr-10">{title}</ModalTitle>
          {typeof description === "string" ? (
            <ModalDescription>{description}</ModalDescription>
          ) : (
            <div data-modal-description className="text-sm text-muted-foreground">{description}</div>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ModalFooter className="sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={() => void handleConfirm()} disabled={isPending}>
            {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ControlledModal>
  );
}
