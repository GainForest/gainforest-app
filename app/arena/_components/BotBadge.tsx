import { getTranslations } from "next-intl/server";
import { BotIcon } from "lucide-react";

/**
 * Bluesky-style automated-account marker: a small robot glyph next to an
 * account name. Shown only for accounts that self-label as bots via the
 * standard ATProto convention (see app/_lib/bot-self-label.ts) — it is the
 * account's own disclosure, not something GainForest assigns.
 */
export async function BotBadge() {
  const t = await getTranslations("common.arena");
  const label = t("botAccount");
  return (
    <span
      className="inline-flex shrink-0 items-center align-[-2px] text-muted-foreground"
      title={label}
    >
      <BotIcon className="size-3.5" aria-label={label} role="img" />
    </span>
  );
}
