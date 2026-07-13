"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

const DRAWER_PADDING_CLASS_PATTERN = /^!?(?:p|px|py|pt|pr|pb|pl|ps|pe)-/;

/**
 * Lift a bottom-anchored drawer clear of the on-screen keyboard on iOS.
 *
 * iOS shrinks only the *visual* viewport when the keyboard opens; the layout
 * viewport (and therefore our `fixed bottom-0` sheet) stays full height, so the
 * sheet's lower portion — where a focused input usually is — hides behind the
 * keyboard (vaul's `repositionInputs` is disabled for us). We read the keyboard
 * overlap from `visualViewport` and offset the sheet by it, then scroll the
 * focused field into view. Android resizes the layout viewport instead, so the
 * measured overlap is ~0 there and this is a no-op — leaving its working
 * behaviour untouched.
 */
function useDrawerKeyboardInset(
  contentRef: React.RefObject<HTMLDivElement | null>,
) {
  React.useEffect(() => {
    const vv =
      typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;

    const applyInset = () => {
      const content = contentRef.current;
      if (!content) return;
      // Only the bottom sheet lives against the keyboard.
      if (content.getAttribute("data-vaul-drawer-direction") !== "bottom") {
        return;
      }
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      content.style.bottom = overlap > 0 ? `${overlap}px` : "";
      return overlap;
    };

    const handleResize = () => {
      const overlap = applyInset();
      if (!overlap) return;
      // Wait for the keyboard/layout to settle, then reveal the focused field.
      requestAnimationFrame(() => {
        const content = contentRef.current;
        const active = document.activeElement as HTMLElement | null;
        if (active && content?.contains(active)) {
          active.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
    };

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", applyInset);
    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", applyInset);
      const content = contentRef.current;
      if (content) content.style.bottom = "";
    };
  }, [contentRef]);
}

const splitDrawerClassName = (className?: string) => {
  if (!className) {
    return {
      outerClassName: undefined,
      innerClassName: undefined,
    };
  }

  const outerClasses: string[] = [];
  const innerClasses: string[] = [];

  for (const token of className.trim().split(/\s+/)) {
    const baseToken = token.split(":").at(-1) ?? token;

    if (DRAWER_PADDING_CLASS_PATTERN.test(baseToken)) {
      innerClasses.push(token);
    } else {
      outerClasses.push(token);
    }
  }

  return {
    outerClassName: outerClasses.join(" ") || undefined,
    innerClassName: innerClasses.join(" ") || undefined,
  };
};

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerHandle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-handle"
      className={cn(
        "bg-muted mx-auto mt-4 mb-1 h-2 w-[100px] shrink-0 rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out duration-300 data-[state=closed]:backdrop-blur-none data-[state=open]:backdrop-blur-lg data-[state=closed]:bg-black/0 data-[state=open]:bg-black/20 fixed inset-0 z-50",
        className,
      )}
      {...props}
    />
  );
}

function DrawerPlaceholder({
  className,
  children,
  dismissible = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  dismissible?: boolean;
}) {
  const { outerClassName, innerClassName } = splitDrawerClassName(className);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  useDrawerKeyboardInset(contentRef);

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={contentRef}
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto min-h-0 min-w-0 flex-col overflow-hidden",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80dvh] data-[vaul-drawer-direction=top]:rounded-b-3xl data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom] data-[vaul-drawer-direction=bottom]:max-h-[80dvh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          outerClassName,
        )}
        {...props}
      >
        {dismissible ? <DrawerHandle /> : null}
        <div
          data-slot="drawer-scroll-body"
          data-vaul-no-drag=""
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain p-4",
            innerClassName,
          )}
        >
          {children}
        </div>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-2 flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPlaceholder,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
