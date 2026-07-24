"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out duration-300 data-[state=closed]:backdrop-blur-none data-[state=open]:backdrop-blur-lg data-[state=closed]:bg-black/0 data-[state=open]:bg-black/20 fixed inset-0 z-[130] motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

function DialogPlaceholder({
  className,
  children,
  dialogWidth,
  overlayClassName,
  fullscreen = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** Tailwind max-width class for the dialog container (e.g. "max-w-2xl"). Defaults to "max-w-sm". */
  dialogWidth?: string;
  /** Optional visual override for this dialog's shared overlay. */
  overlayClassName?: string;
  /**
   * Take over the whole viewport (phone "full page" mode). Overrides the
   * centered floating card: edge-to-edge, full dynamic height, no radius.
   */
  fullscreen?: boolean;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[130] grid w-[calc(100%-1.5rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-4xl border p-4 shadow-lg duration-200 transition-[max-width] motion-reduce:animate-none motion-reduce:transition-none sm:w-full sm:p-5",
          // Keep the centered shell inside the dynamic viewport with the same
          // 12px phone overlay gutter used by drawers and floating controls.
          "max-h-[calc(100dvh-1.5rem)] overflow-x-hidden overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-2rem)]",
          dialogWidth ?? "max-w-sm",
          // Fullscreen mode (opt-in per modal, small screens only): the dialog
          // becomes the page. Listed after dialogWidth so tailwind-merge lets
          // these win over the centered-card geometry above.
          fullscreen &&
            "top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-4 flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogPlaceholder,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
