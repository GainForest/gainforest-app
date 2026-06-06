import Link from "next/link";
import type { ReactNode } from "react";

export type StatsTileItem = {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  href?: string;
  accent?: boolean;
};

const GRID_COLUMNS: Record<3 | 4 | 5 | 6, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

export function StatsTileGrid({
  items,
  columns = 3,
  className,
}: {
  items: StatsTileItem[];
  columns?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div className={["grid grid-cols-2 gap-3 sm:gap-4", GRID_COLUMNS[columns], className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <StatsTile key={item.label} {...item} />
      ))}
    </div>
  );
}

export function StatsTile({ label, value, detail, icon, accent = false, href }: StatsTileItem) {
  if (value == null) return null;

  const content = (
    <>
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex shrink-0 items-center justify-center text-primary transition-transform duration-300 group-hover:scale-105 [&_svg]:size-4 sm:[&_svg]:size-5">
            {icon}
          </span>
          <span className="sr-only">{label}</span>
          <div
            className={[
              "min-w-0 text-2xl font-semibold tracking-[-0.02em] tabular-nums sm:text-3xl",
              accent ? "text-primary" : "text-foreground",
            ].join(" ")}
          >
            {value}
          </div>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground first-letter:uppercase sm:text-sm sm:leading-normal">{detail}</p>
      </div>
    </>
  );

  const className =
    "group relative overflow-hidden rounded-2xl bg-foreground/5 p-4 text-left backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-foreground/[0.07] sm:rounded-3xl sm:p-6";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
