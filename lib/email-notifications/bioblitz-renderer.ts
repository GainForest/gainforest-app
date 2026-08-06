import "server-only";

import { renderBioblitzWinnerEmail, resolveBioblitzWinnerLocale } from "@/lib/email/bioblitz-winner-template";
import type { BioblitzPrize } from "./bioblitz";
import type { Json, NotificationRenderer, RenderableRow, RenderedNotification } from "./types";

const ERROR = "BioBlitz notification row is invalid. Verify the committed award snapshot.";
function object(value: Json): Record<string, Json> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, Json> : null;
}

export class BioblitzNotificationRenderer implements NotificationRenderer {
  async render(row: RenderableRow): Promise<RenderedNotification> {
    const payload = object(row.payload);
    const roundId = payload?.roundId;
    const prize = payload?.prize;
    const roundLabel = payload?.roundLabel;
    const winnerDid = payload?.winnerDid;
    const createdAt = payload?.createdAt;
    if (row.eventType !== "bioblitz_winner" || row.templateKey !== "bioblitz-winner" || !payload
      || typeof roundId !== "number" || !Number.isInteger(roundId) || roundId < 1
      || (prize !== "most-observations" && prize !== "best-picture")
      || typeof roundLabel !== "string" || !roundLabel.trim() || roundLabel.length > 100
      || typeof winnerDid !== "string" || winnerDid.length > 256
      || typeof createdAt !== "string" || Number.isNaN(new Date(createdAt).getTime())
      || row.sourceId !== `bioblitz:${roundId}:${prize}`) throw new Error(ERROR);
    return renderBioblitzWinnerEmail({
      locale: resolveBioblitzWinnerLocale({ explicitLocale: row.locale }),
      roundLabel,
      prize: prize as BioblitzPrize,
    });
  }
}
