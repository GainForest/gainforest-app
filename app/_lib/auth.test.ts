import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAuth() {
  vi.resetModules();
  return import("./auth");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getAuthForwardCookie", () => {
  it("forwards only the production auth cookie for the production auth base", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://www.gainforest.app");
    const { getAuthForwardCookie } = await loadAuth();

    expect(getAuthForwardCookie("theme=dark; __Secure_gainforest_session=prod; __Secure_gainforest_staging_session=staging")).toBe(
      "__Secure_gainforest_session=prod",
    );
  });

  it("forwards only the staging auth cookie for a staging auth base", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BASE_URL", "https://staging.gainforest.app");
    const { getAuthForwardCookie } = await loadAuth();

    expect(getAuthForwardCookie("__Secure_gainforest_session=prod; __Secure_gainforest_staging_session=staging")).toBe(
      "__Secure_gainforest_staging_session=staging",
    );
  });
});
