import { afterEach, describe, expect, it, vi } from "vitest";

import { retryCgsInvitationEmail } from "./cgs";

afterEach(() => vi.unstubAllGlobals());

describe("CGS invitation API errors", () => {
  it("preserves a stable invitation error code without requiring English copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: "Please wait a minute before trying to send this email again.",
      code: "invitation_retry_cooldown",
    }, { status: 429 })));

    const error = await retryCgsInvitationEmail("81000000-0000-4000-8000-000000000001")
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "invitation_retry_cooldown" });
  });

  it("maps server error codes to the invitation translation keys", async () => {
    const module = await import("./cgs") as unknown as Record<string, unknown>;
    const helper = module.invitationErrorTranslationKey;
    expect(helper).toBeTypeOf("function");
    const translate = helper as (error: unknown) => string | null;
    expect(translate({ code: "invitation_role_conflict" })).toBe("roleConflictError");
    expect(translate({ code: "invitation_retry_cooldown" })).toBe("retryCooldownError");
    expect(translate({ code: "invitation_notification_not_safely_retryable" })).toBe("retryUnsafeError");
    expect(translate(new Error("untyped"))).toBeNull();
  });
});
