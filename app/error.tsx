"use client";

import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reportClientError } from "./_lib/client-error-report";

/**
 * Route-level error boundary: catches render/runtime errors thrown by any
 * page below the root layout, keeps the shell (sidebar/header) alive, and
 * offers a plain-language retry instead of Next's generic full-page
 * "Application error" screen.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorPage");

  useEffect(() => {
    reportClientError(error, `route-error${error.digest ? `:${error.digest}` : ""}`);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <RefreshCwIcon className="size-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("description")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          {t("tryAgain")}
        </Button>
        <Link href="/feed" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
