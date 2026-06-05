import { cn } from "@/lib/utils";
import React from "react";

const Container = ({
  children,
  className,
  ...props
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={cn("w-full max-w-6xl mx-auto p-4", className)} {...props}>
      {children}
    </div>
  );
};

export default Container;
