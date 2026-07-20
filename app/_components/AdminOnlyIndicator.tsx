"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Small, reusable marker for controls and views restricted to administrators. */
export function AdminOnlyIndicator({ className }: { className?: string }) {
  const t = useTranslations("common.adminOnly");
  const label = t("label");

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
