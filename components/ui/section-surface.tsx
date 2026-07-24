import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const sectionSurfaceVariants = cva("min-w-0", {
  variants: {
    variant: {
      plain: "",
      muted: "rounded-2xl bg-muted p-4 sm:p-5",
      danger:
        "rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-foreground sm:p-5",
      elevated:
        "rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-lg sm:p-5",
    },
  },
  defaultVariants: {
    variant: "plain",
  },
});

type SectionSurfaceElement = "div" | "section" | "aside";

type SectionSurfaceProps<T extends SectionSurfaceElement = "section"> = {
  as?: T;
} & VariantProps<typeof sectionSurfaceVariants> &
  Omit<ComponentPropsWithoutRef<T>, "as">;

/** Layout-only section treatment. Functional boundaries should use their own primitives. */
export function SectionSurface<T extends SectionSurfaceElement = "section">({
  as,
  variant,
  className,
  ...props
}: SectionSurfaceProps<T>) {
  const Surface = (as ?? "section") as ElementType;

  return (
    <Surface
      data-slot="section-surface"
      data-variant={variant ?? "plain"}
      className={cn(sectionSurfaceVariants({ variant }), className)}
      {...props}
    />
  );
}

export { sectionSurfaceVariants };
