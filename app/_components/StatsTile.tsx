import Link from "next/link";
import type { ReactNode } from "react";

export type StatsTileItem = {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  href?: string;
  accent?: boolean;
  /** Extra classes for the tile wrapper, e.g. grid-column spanning. */
  className?: string;
};

export type RecordDrawerStatsTileItem = {
  icon: ReactNode;
  value: string;
  label: string;
  className?: string;
  valueClassName?: string;
};

const GRID_COLUMNS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "lg:grid-cols-2",
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
  columns?: 2 | 3 | 4 | 5 | 6;
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

export function StatsTile({ label, value, icon, accent = false, href, className: extraClassName }: StatsTileItem) {
  if (value == null) return null;

  const content = (
    <>
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex shrink-0 items-center justify-center text-primary transition-transform duration-300 group-hover:scale-105 [&_svg]:size-4 sm:[&_svg]:size-5">
            {icon}
          </span>
          <div
            className={[
              "min-w-0 truncate text-xl font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl lg:text-3xl",
              accent ? "text-primary" : "text-foreground",
            ].join(" ")}
          >
            {value}
          </div>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground first-letter:uppercase sm:text-sm sm:leading-normal">{label}</p>
      </div>
    </>
  );

  const className = [
    "group relative overflow-hidden rounded-2xl bg-foreground/5 p-4 text-left backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-foreground/[0.07] sm:rounded-3xl sm:p-6",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

export function RecordDrawerStatsTile({
  icon,
  value,
  label,
  className = "",
  valueClassName = "text-2xl font-semibold tabular-nums",
}: RecordDrawerStatsTileItem) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-foreground/5 px-4 py-3 ${className}`}>
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <span className="flex items-center text-primary [&_svg]:size-4">{icon}</span>
      <div className={`mt-1.5 tracking-[-0.02em] text-foreground ${valueClassName}`}>{value}</div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
