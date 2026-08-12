import Image from "next/image";
import type { ReactNode } from "react";
import { SproutIcon, UserRoundIcon } from "lucide-react";

/** Shared card shell for every admin view: icon + heading + count + body. */
export function AdminPanel({
  Icon,
  title,
  description,
  count,
  footer,
  children,
}: {
  Icon: typeof SproutIcon;
  title: string;
  description: string;
  count: number;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
      <header className="border-b border-border/70 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
            <Icon className="size-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <p className="mt-1.5 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
      {footer ? (
        <p className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:px-6">{footer}</p>
      ) : null}
    </section>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function AdminAvatar({ url }: { url: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
      {url ? (
        <Image src={url} alt="" width={40} height={40} unoptimized className="size-full object-cover" />
      ) : (
        <UserRoundIcon className="size-5 text-muted-foreground" />
      )}
    </span>
  );
}
