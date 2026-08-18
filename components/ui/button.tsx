"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 cursor-pointer shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-border bg-background hover:shadow-sm hover:bg-muted hover:text-foreground dark:border-input dark:hover:bg-background/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-10 px-8 text-base has-[>svg]:px-4",
        icon: "h-9 w-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "h-7 w-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Pick only the Framer Motion-specific props (not ones that conflict with HTML button events)
type MotionOnlyProps = Pick<
  HTMLMotionProps<"button">,
  | "initial"
  | "animate"
  | "exit"
  | "variants"
  | "whileHover"
  | "whileTap"
  | "whileFocus"
  | "whileDrag"
  | "whileInView"
  | "layoutId"
  | "layoutRoot"
  | "layout"
  | "transition"
>;

interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants>,
    MotionOnlyProps {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ref,
  whileTap,
  transition,
  initial,
  animate,
  exit,
  variants: motionVariants,
  whileHover,
  whileFocus,
  whileDrag,
  whileInView,
  layoutId,
  layoutRoot,
  layout,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...(props as React.ComponentProps<typeof Slot.Root>)}
      />
    );
  }

  return (
    <motion.button
      ref={ref}
      data-slot="button"
      whileTap={whileTap ?? { scale: 0.97 }}
      transition={transition ?? { type: "spring", stiffness: 400, damping: 25 }}
      initial={initial}
      animate={animate}
      exit={exit}
      variants={motionVariants}
      whileHover={whileHover}
      whileFocus={whileFocus}
      whileDrag={whileDrag}
      whileInView={whileInView}
      layoutId={layoutId}
      layoutRoot={layoutRoot}
      layout={layout}
      className={cn(buttonVariants({ variant, size, className }))}
      {...(props as React.ComponentProps<typeof motion.button>)}
    />
  );
}

export { Button, buttonVariants };
