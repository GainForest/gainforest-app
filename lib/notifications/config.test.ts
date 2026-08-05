import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createEmailProvider } from "./provider";
import { readNotificationConfig } from "./config";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification configuration", () => {
  it("defaults delivery to disabled and every producer to false", () => {
    expect(readNotificationConfig({})).toEqual({
      deliveryMode: "disabled",
      producers: {
        signup: false,
        membershipJoined: false,
        invitation: false,
        bioblitzWinner: false,
      },
    });
  });

  it("accepts only explicit modes and boolean producer flags", () => {
    expect(readNotificationConfig({
      EMAIL_DELIVERY_MODE: "capture",
      EMAIL_SIGNUP_ENABLED: "true",
      EMAIL_MEMBERSHIP_JOINED_ENABLED: "false",
      EMAIL_INVITATION_ENABLED: "true",
      EMAIL_BIOBLITZ_WINNER_ENABLED: "false",
    })).toEqual({
      deliveryMode: "capture",
      producers: {
        signup: true,
        membershipJoined: false,
        invitation: true,
        bioblitzWinner: false,
      },
    });

    expect(() => readNotificationConfig({ EMAIL_DELIVERY_MODE: "live" }))
      .toThrow("EMAIL_DELIVERY_MODE must be one of disabled, capture, or resend; received \"live\"");
    expect(() => readNotificationConfig({ EMAIL_SIGNUP_ENABLED: "1" }))
      .toThrow("EMAIL_SIGNUP_ENABLED must be exactly true or false; received \"1\"");
  });

  it("keeps disabled/capture local and rejects the intentionally absent live adapter", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sink: Parameters<typeof createEmailProvider>[1] = {
      idempotencyGuaranteeMs: 7 * 24 * 60 * 60 * 1000,
      captureOnce: vi.fn(() => "captured" as const),
    };

    expect(createEmailProvider("disabled", sink)).toBeNull();
    const capture = createEmailProvider("capture", sink);
    expect(capture).not.toBeNull();
    await capture!.send({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Subject",
      html: "<p>Body</p>",
      text: "Body",
      idempotencyKey: "row-1",
    }, { timeoutMs: 1000 });
    expect(fetchMock).not.toHaveBeenCalled();

    expect(() => createEmailProvider("resend", sink)).toThrow(
      "EMAIL_DELIVERY_MODE=resend is unavailable: this milestone intentionally has no live email provider adapter. Use disabled or capture.",
    );
  });
});
