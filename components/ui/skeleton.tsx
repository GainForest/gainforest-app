import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-r from-muted via-muted-foreground/20 to-muted bg-[length:200%_100%] animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}
