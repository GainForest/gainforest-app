"use client";

import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";

type ManageConfirmModalProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ManageConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  isPending = false,
  onConfirm,
}: ManageConfirmModalProps) {
  const modal = useModal();
  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  return (
    <ModalContent dismissible={!isPending} className="space-y-4">
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => void close()}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} disabled={isPending} onClick={() => void onConfirm()}>
          {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
          {confirmLabel}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
