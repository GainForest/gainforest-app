"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function ListLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-72 w-full overflow-y-auto">
      <div className="flex flex-col gap-2 pr-1">{children}</div>
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
    <div className="rounded-xl bg-muted/40 p-5 text-center">
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
      className="inline-flex w-fit items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-primary"
    >
      {label}
      <ExternalLinkIcon className="h-3 w-3" />
    </Link>
  );
}
