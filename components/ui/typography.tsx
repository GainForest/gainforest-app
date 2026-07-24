import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DisplayHeadingElement = "h1" | "h2" | "h3";

type DisplayHeadingProps<T extends DisplayHeadingElement = "h2"> = {
  as?: T;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children">;

/** Semantic product heading using the non-landing display treatment. */
export function DisplayHeading<T extends DisplayHeadingElement = "h2">({
  as,
  className,
  ...props
}: DisplayHeadingProps<T>) {
  const Heading = (as ?? "h2") as ElementType;

  return (
    <Heading
      className={cn("font-instrument italic", className)}
      {...props}
    />
  );
}

type ContextHeadingElement = "h2" | "h3" | "h4" | "h5" | "h6";

type ContextHeadingProps<T extends ContextHeadingElement = "h3"> = {
  as?: T;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children">;

/**
 * Semantic heading for a nested contextual level beneath the composition's
 * display headings. Heading tags still express document structure; this
 * treatment expresses the quieter visual role.
 */
export function ContextHeading<T extends ContextHeadingElement = "h3">({
  as,
  className,
  ...props
}: ContextHeadingProps<T>) {
  const Heading = (as ?? "h3") as ElementType;

  return (
    <Heading
      data-heading-role="context"
      className={cn("font-sans font-medium text-foreground", className)}
      {...props}
    />
  );
}

type BrandWordProps = Omit<ComponentPropsWithoutRef<"span">, "children">;

/** The only non-landing Garamond treatment. The visible text is intentionally fixed. */
export function BrandWord({ className, ...props }: BrandWordProps) {
  return (
    <span
      className={cn("font-brand-word", className)}
      {...props}
    >
      GainForest
    </span>
  );
}
