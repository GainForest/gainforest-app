import * as React from "react";
import { cn } from "@/lib/utils";

function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="separator" className={cn("bg-border shrink-0 h-px w-full", className)} {...props} />;
}

export { Separator };
