import { cva, type VariantProps } from "class-variance-authority";
import React from "react";
import { cn } from "@/lib/utils";

const containerVariants = cva("mx-auto w-full", {
  variants: {
    family: {
      reading: "max-w-3xl",
      standard: "max-w-6xl",
      wide: "max-w-[90rem]",
      full: "max-w-none",
    },
    gutter: {
      true: "px-3 sm:px-5 lg:px-8",
      false: "",
    },
    rhythm: {
      standard: "py-4 lg:py-6",
      none: "",
    },
  },
  defaultVariants: {
    family: "standard",
    gutter: true,
    rhythm: "standard",
  },
});

type ContainerProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof containerVariants> & {
    children: React.ReactNode;
  };

/** The single width and outer-gutter owner for a page or embedded workspace. */
const Container = ({
  children,
  className,
  family,
  gutter,
  rhythm,
  ...props
}: ContainerProps) => (
  <div
    data-layout-family={family ?? "standard"}
    className={cn(containerVariants({ family, gutter, rhythm }), className)}
    {...props}
  >
    {children}
  </div>
);

export { containerVariants };
export default Container;
