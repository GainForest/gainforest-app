import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AccountNotice({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actionHref && actionLabel && (
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
