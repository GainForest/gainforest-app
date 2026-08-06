import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readNotificationConfig } from "./config";

describe("notification configuration", () => {
  it("enables email by default when EMAIL_DISABLED is absent or empty", () => {
    expect(readNotificationConfig({})).toEqual({ emailDisabled: false });
    expect(readNotificationConfig({ EMAIL_DISABLED: "" })).toEqual({ emailDisabled: false });
  });

  it("uses EMAIL_DISABLED as the only email delivery switch", () => {
    expect(readNotificationConfig({ EMAIL_DISABLED: "true" })).toEqual({ emailDisabled: true });
    expect(readNotificationConfig({ EMAIL_DISABLED: " false " })).toEqual({ emailDisabled: false });
  });

  it("rejects ambiguous EMAIL_DISABLED values with corrective guidance", () => {
    expect(() => readNotificationConfig({ EMAIL_DISABLED: "1" })).toThrow(
      "EMAIL_DISABLED must be exactly true or false; received \"1\". Use true to stop all notification email or false to send through Resend.",
    );
  });
});
