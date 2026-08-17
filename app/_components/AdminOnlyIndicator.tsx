"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Small, reusable marker for a control or view that is not public.
 *
 * Both the icon and the label say *who* it is restricted to: a padlock for
 * admin-only, a pair of people for "the members of this thing". One marker
 * for every kind of restriction would make an admin-only view and a view
 * shared with a whole organization look identical, which is the opposite of
 * what the marker is for.
 */
export function RestrictedIndicator({
  label,
  Icon = LockIcon,
  className,
}: {
  label: string;
  Icon?: typeof LockIcon;
  className?: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center text-current opacity-60", className)}
    >
      <Icon aria-hidden="true" className="size-3" />
    </span>
  );
}

/** Marker for controls and views restricted to administrators. */
export function AdminOnlyIndicator({ className }: { className?: string }) {
  const t = useTranslations("common.adminOnly");
  return <RestrictedIndicator label={t("label")} Icon={LockIcon} className={className} />;
}

