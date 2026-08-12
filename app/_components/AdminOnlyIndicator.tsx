"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Small, reusable marker for a control or view that is not public. The label
 *  says who it is restricted to, so the same padlock can mark an admin-only
 *  view and a view private to one grant without either one lying. */
export function RestrictedIndicator({ label, className }: { label: string; className?: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center text-current opacity-60", className)}
    >
      <LockIcon aria-hidden="true" className="size-3" />
    </span>
  );
}

/** Marker for controls and views restricted to administrators. */
export function AdminOnlyIndicator({ className }: { className?: string }) {
  const t = useTranslations("common.adminOnly");
  return <RestrictedIndicator label={t("label")} className={className} />;
}
