import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

export function AssetMetaRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-sm leading-snug text-foreground">{children}</dd>
      </div>
    </div>
  );
}

export function AssetAttribution({
  heading,
  href,
  ownerName,
  avatarUrl,
  actionLabel,
}: {
  heading: string;
  href: string;
  ownerName: string;
  avatarUrl?: string | null;
  actionLabel: string;
}) {
  return (
    <section className="mt-8 border-t border-border-soft pt-6">
      <h2 className="font-instrument text-lg font-semibold italic text-foreground">{heading}</h2>
      <Link href={href} className="group mt-3 flex min-h-11 items-center gap-3">
        <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS/CDN hosts
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-sm font-semibold text-muted-foreground">
              {ownerName.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-foreground transition-colors group-hover:text-primary">
            {ownerName}
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            {actionLabel}
            <ArrowUpRightIcon className="size-3" aria-hidden />
          </span>
        </span>
      </Link>
    </section>
  );
}
