import { useTranslations } from "next-intl";
import { BotIcon } from "lucide-react";

/**
 * Bluesky-style automated-account marker: a small robot glyph next to an
 * account name. Shown only for accounts that self-label as bots via the
 * standard ATProto convention (see app/_lib/bot-self-label.ts) — it is the
 * account's own disclosure, not something GainForest assigns.
 *
 * Uses `useTranslations`, which next-intl supports in both server and client
 * components, so every surface (feed chips, hover cards, profile hero,
 * leaderboard) can render the same badge.
 */
export function BotBadge() {
  const t = useTranslations("common.bot");
  const label = t("label");
  return (
    <span
      className="inline-flex shrink-0 items-center align-[-2px] text-muted-foreground"
      title={label}
    >
      <BotIcon className="size-3.5" aria-label={label} role="img" />
    </span>
  );
}
