import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { BioblitzPrizeNotificationStatus } from "./BioblitzAwardControls";

describe("BioblitzPrizeNotificationStatus", () => {
  it("offers explicit retry only for a retryable notification", () => {
    const retryable = renderToStaticMarkup(
      <BioblitzPrizeNotificationStatus
        label="Best picture email"
        notification={{ status: "not_prepared", canMarkHandled: true, canRetry: true }}
        busy={false}
        onRetry={() => {}}
        onMarkHandled={() => {}}
      />,
    );
    const waiting = renderToStaticMarkup(
      <BioblitzPrizeNotificationStatus
        label="Best picture email"
        notification={{ status: "missing_email", canMarkHandled: true, canRetry: false }}
        busy={false}
        onRetry={() => {}}
        onMarkHandled={() => {}}
      />,
    );

    expect(retryable).toContain("notification.retry");
    expect(waiting).not.toContain("notification.retry");
  });
});
