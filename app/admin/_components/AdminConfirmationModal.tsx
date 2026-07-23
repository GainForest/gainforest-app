"use client";

import { useState } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";

export function AdminConfirmationModal({
  title,
  description,
  actionLabel,
  cancelLabel,
  errorLabel,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  cancelLabel: string;
  errorLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const modal = useModal();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function close() {
    void modal.hide().then(() => modal.popModal());
  }

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      close();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <ModalContent dismissible={!busy}>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      {failed ? <p aria-live="polite" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorLabel}</p> : null}
      <ModalFooter>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirm()} className="w-full">
          {busy ? <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" /> : <Trash2Icon className="size-4" />}
          {actionLabel}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={close} className="w-full">{cancelLabel}</Button>
      </ModalFooter>
    </ModalContent>
  );
}
