"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useViewer } from "@/app/_lib/viewer";

export function ProjectFeaturedToggle({
  projectUri,
  variant = "button",
  className,
}: {
  projectUri: string;
  variant?: "button" | "sidebar";
  className?: string;
}) {
  const t = useTranslations("marketplace.projects.featured.manage");
  const viewer = useViewer();
  const [canManage, setCanManage] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setCanManage(false);
    setFeatured(false);
    setError(false);
    if (viewer.status !== "ready" || !viewer.sessionDid) return;
    const controller = new AbortController();
    fetch("/api/internal/featured-projects", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ uris?: string[]; canManage?: boolean }> : null)
      .then((data) => {
        if (!data || controller.signal.aborted) return;
        setCanManage(data.canManage === true);
        setFeatured(Array.isArray(data.uris) && data.uris.includes(projectUri));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [projectUri, viewer.sessionDid, viewer.status]);

  if (!canManage) return null;

  const label = featured ? t("remove") : t("add");
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/internal/featured-projects", {
        method: featured ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri: projectUri }),
      });
      if (!response.ok) throw new Error("update failed");
      setFeatured((current) => !current);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn(variant === "sidebar" && "w-full", className)}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={featured}
        className={cn(
          "inline-flex items-center justify-center gap-2 border font-medium transition-colors disabled:cursor-wait disabled:opacity-70",
          variant === "sidebar"
            ? "h-11 w-full rounded-xl border-border-soft bg-background px-4 text-sm text-foreground hover:border-amber-400/60 hover:text-amber-600"
            : "h-9 rounded-full border-border-soft bg-background px-3 text-sm text-foreground hover:border-amber-400/60 hover:text-amber-600",
          featured && "border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
        )}
      >
        {busy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden /> : <StarIcon className={cn("h-4 w-4", featured && "fill-current")} aria-hidden />}
        {label}
      </button>
      {error ? <p aria-live="polite" className="mt-2 text-xs text-destructive">{t("error")}</p> : null}
    </div>
  );
}
