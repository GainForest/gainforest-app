import Link from "next/link";
import { ArrowLeftIcon, type SproutIcon } from "lucide-react";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";

/** Title block shared by every admin page. */
export function AdminPageHeader({
  Icon,
  title,
  subtitle,
  backLabel,
}: {
  Icon: typeof SproutIcon;
  title: string;
  subtitle: string;
  /** Shows a link up to the admin home. Omitted on the home page itself. */
  backLabel?: string;
}) {
  return (
    <header className="mb-6">
      {backLabel ? (
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1.5 rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-3.5" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" />
        <h1 className="font-instrument text-3xl font-light italic tracking-[-0.04em]">{title}</h1>
        <AdminOnlyIndicator className="text-muted-foreground" />
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{subtitle}</p>
    </header>
  );
}
