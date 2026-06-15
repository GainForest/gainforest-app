import Link from "next/link";
import { useTranslations } from "next-intl";
import { STATUS_URL } from "../_lib/urls";
import {
  pageLabel,
  pageTone,
  type StatusSnapshot,
  type StatusTone,
} from "../_lib/status";

export const TONE_DOT: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  down: "text-down",
  neutral: "text-foreground/40",
};

export const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  down: "text-down",
  neutral: "text-foreground/55",
};

/** Compact, link-out status chip used in the hero and top nav. Purely
 *  presentational — fed by the server-prefetched snapshot. */
export function StatusPill({
  snapshot,
  href = `${STATUS_URL}`,
  className = "",
}: {
  snapshot: StatusSnapshot;
  href?: string;
  className?: string;
}) {
  const t = useTranslations("common.status");
  const tone = pageTone(snapshot.page, snapshot.degraded);
  const operational = snapshot.components.filter(
    (c) => c.status === "OPERATIONAL",
  ).length;
  const total = snapshot.components.length;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`group inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:border-foreground/25 ${className}`}
      title={t("pillTitle")}
    >
      <span className={`relative inline-flex h-2 w-2 ${TONE_DOT[tone]}`}>
        <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-current" />
      </span>
      <span className={TONE_TEXT[tone]}>{t(`page.${snapshot.degraded ? "degraded" : snapshot.page}`)}</span>
      {total > 0 && (
        <span className="text-foreground/45">
          {operational}/{total}
        </span>
      )}
    </Link>
  );
}
