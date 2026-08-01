"use client";

import { useEffect, useId, useRef } from "react";
import { ModalPortal, useModal } from "./context";

/**
 * Adapts a conventional controlled `open` API to the shared responsive modal
 * host. This keeps controlled prompts on the same Radix dialog / Vaul bottom
 * sheet system as stack-driven product flows.
 */
export function ControlledModal({
  open,
  onOpenChange,
  children,
  id,
  dialogWidth,
  forceDialog,
  fullscreenOnMobile,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  id?: string;
  dialogWidth?: string;
  forceDialog?: boolean;
  fullscreenOnMobile?: boolean;
  role?: "dialog" | "alertdialog";
}) {
  const generatedId = useId();
  const modalId = id ?? `controlled-modal-${generatedId}`;
  const callbackRef = useRef(onOpenChange);
  const mountedRef = useRef(false);
  callbackRef.current = onOpenChange;

  const { stack, isOpen, pushModal, show, dismiss } = useModal();
  const isMounted = stack.includes(modalId);

  useEffect(() => {
    if (!open) return;

    if (!isMounted) {
      pushModal(
        {
          id: modalId,
          dialogWidth,
          forceDialog,
          fullscreenOnMobile,
          role,
          onOpenChange: (nextOpen) => callbackRef.current(nextOpen),
        },
        true,
      );
      void show();
      return;
    }

    // Preserve normal controlled semantics if a parent rejects a native close.
    if (!isOpen) void show();
  }, [dialogWidth, forceDialog, fullscreenOnMobile, isMounted, isOpen, modalId, open, pushModal, role, show]);

  useEffect(() => {
    if (open || !isMounted || !isOpen) return;
    dismiss(modalId);
  }, [dismiss, isMounted, isOpen, modalId, open]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // React Strict Mode immediately remounts effects in development. Defer
      // cleanup one microtask so that simulated unmount cannot close the modal.
      queueMicrotask(() => {
        if (!mountedRef.current) dismiss(modalId);
      });
    };
  }, [dismiss, modalId]);

  return <ModalPortal id={modalId}>{children}</ModalPortal>;
}
