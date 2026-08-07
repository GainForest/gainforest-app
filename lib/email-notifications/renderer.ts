import "server-only";

import { BioblitzNotificationRenderer } from "./bioblitz-renderer";
import { InvitationNotificationRenderer } from "./invitation-renderer";
import type { NotificationRenderer, RenderableRow, RenderedNotification } from "./types";
import { WelcomeNotificationRenderer } from "./welcome-renderer";

/** Routes persisted event types to their strict production template adapters. */
export class ApplicationNotificationRenderer implements NotificationRenderer {
  private readonly welcome = new WelcomeNotificationRenderer();
  private readonly invitation = new InvitationNotificationRenderer();
  private readonly bioblitz = new BioblitzNotificationRenderer();

  async render(row: RenderableRow): Promise<RenderedNotification> {
    if (row.eventType === "signup" || row.eventType === "membership_joined") {
      return this.welcome.render(row);
    }
    if (row.eventType === "invitation") return this.invitation.render(row);
    if (row.eventType === "bioblitz_winner") return this.bioblitz.render(row);
    throw new Error("Notification event has no registered renderer. Add its production template adapter before enabling the producer.");
  }
}
