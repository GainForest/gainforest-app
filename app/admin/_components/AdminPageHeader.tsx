import type { SproutIcon } from "lucide-react";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";

/** Title block shared by every admin page. */
export function AdminPageHeader({
  Icon,
  title,
  subtitle,
}: {
  Icon: typeof SproutIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" />
        <h1 className="font-instrument text-3xl font-light italic tracking-[-0.04em]">{title}</h1>
        <AdminOnlyIndicator className="text-muted-foreground" />
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{subtitle}</p>
    </header>
  );
}
