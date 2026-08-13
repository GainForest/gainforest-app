import { FlaskConicalIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Container from "@/components/ui/container";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA } from "../../_lib/rewilding-grant";

/**
 * Shared chrome for the two Rewilding dashboard routes.
 *
 * An enrolled grantee sees their own dashboard, plainly headed. An admin sees
 * the same pages as a preview and the shell says so — the eyebrow carries the
 * admin marker so a preview is never mistaken for a real grant's state. The
 * recorder and species stats are placeholder either way, and the notice
 * states that.
 */
export async function RewildingPageShell({
  children,
  isAdminPreview,
}: {
  children: React.ReactNode;
  /** True when the viewer is an admin previewing, not an enrolled grantee. */
  isAdminPreview: boolean;
}) {
  const t = await getTranslations("marketplace.grants.rewildingDashboard.shell");

  return (
    <Container className="flex flex-col gap-4 py-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {isAdminPreview ? <AdminOnlyIndicator /> : null}
        {isAdminPreview ? t("eyebrow") : t("granteeEyebrow")}
      </div>

      {REWILDING_DASHBOARD_USES_PLACEHOLDER_DATA ? (
        <p className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm leading-6 text-foreground/80">
          <FlaskConicalIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          {t("placeholderNotice")}
        </p>
      ) : null}

      {children}
    </Container>
  );
}
