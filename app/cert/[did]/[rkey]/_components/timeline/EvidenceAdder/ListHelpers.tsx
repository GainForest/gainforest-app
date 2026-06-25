"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function ListLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-muted/80">
      <div className="max-h-72 w-full overflow-y-auto p-1.5">
        <div className="flow-root py-2">
          <div className="flex flex-col gap-1">{children}</div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-t from-transparent via-muted/80 to-muted/80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b from-transparent to-muted/80" />
    </div>
  );
}

export function PickerEmpty({
  label,
  href,
  manageLabel,
}: {
  label: string;
  href?: string;
  manageLabel?: string;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");

  return (
    <div className="rounded-xl border border-dashed border-border/70 p-5 text-center">
      <p className="text-sm font-medium text-foreground">
        {evidenceT("emptyUploaded", { type: label })}
      </p>
      {href ? (
        <ManageLink href={href} label={manageLabel ?? evidenceT("manageType", { type: label })} />
      ) : null}
    </div>
  );
}

export function ManageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary"
    >
      {label}
      <ExternalLinkIcon className="h-3 w-3" />
    </Link>
  );
}
