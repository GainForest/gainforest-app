import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

export type ManageAction = {
  href: string;
  label: string;
  description: string;
};

/**
 * A quiet row pointing from a public profile tab to the working surface behind
 * it — "here is where you change this". Renders nothing when there is no
 * action, so callers can pass the result of a permission check straight in.
 */
export function ManageActionRow({ action }: { action?: ManageAction | null }) {
  if (!action) return null;

  return (
    <Link
      href={action.href}
      className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-sm transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{action.label}</span>
        <span className="mt-0.5 block text-muted-foreground">{action.description}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
