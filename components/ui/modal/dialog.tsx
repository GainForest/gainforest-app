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
        "data-[state=open]:animate-in data-[state=closed]:animate-out duration-300 data-[state=closed]:backdrop-blur-none data-[state=open]:backdrop-blur-lg data-[state=closed]:bg-black/0 data-[state=open]:bg-black/20 fixed inset-0 z-50",
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
  fullscreen = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** Tailwind max-width class for the dialog container (e.g. "max-w-2xl"). Defaults to "max-w-sm". */
  dialogWidth?: string;
  /**
   * Take over the whole viewport (phone "full page" mode). Overrides the
   * centered floating card: edge-to-edge, full dynamic height, no radius.
   */
  fullscreen?: boolean;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 rounded-4xl border p-6 shadow-lg duration-200 transition-[max-width]",
          // Never let a centered dialog grow past the viewport — cap it to the
          // (dynamic) screen height and scroll its own content. Without this a
          // tall dialog (e.g. a forceDialog modal on a phone) overflows above and
          // below the screen and the title/footer become unreachable.
          "max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain",
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
      className={cn("mt-4 flex flex-col gap-1", className)}
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
