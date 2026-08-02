import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAuth() {
  vi.resetModules();
  return import("./auth");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getAuthInternalServiceToken", () => {
  it("prefers an explicit auth internal token over the Supabase key", async () => {
    vi.stubEnv("AUTH_INTERNAL_SERVICE_TOKEN", "auth-internal");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "supabase-service-role");
    const { getAuthInternalServiceToken } = await loadAuth();

    expect(getAuthInternalServiceToken()).toBe("auth-internal");
  });

  it("falls back to the Supabase service role key for shared-project deployments", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "supabase-service-role");
    const { getAuthInternalServiceToken } = await loadAuth();

    expect(getAuthInternalServiceToken()).toBe("supabase-service-role");
  });
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

describe("getHandleChangeFreshness", () => {
  it("accepts a recent marker and buckets it", async () => {
    const { getHandleChangeFreshness } = await loadAuth();
    const now = Date.now();
    const value = getHandleChangeFreshness(`gainforest_handle_changed=${now}`);
    expect(value).toBe(String(Math.floor(now / 30_000)));
  });

  it("ignores a missing, malformed, expired, or future marker", async () => {
    const { getHandleChangeFreshness } = await loadAuth();
    const now = Date.now();
    expect(getHandleChangeFreshness(null)).toBeNull();
    expect(getHandleChangeFreshness("theme=dark")).toBeNull();
    expect(getHandleChangeFreshness("gainforest_handle_changed=garbage")).toBeNull();
    expect(getHandleChangeFreshness(`gainforest_handle_changed=${now - 16 * 60_000}`)).toBeNull();
    expect(getHandleChangeFreshness(`gainforest_handle_changed=${now + 5 * 60_000}`)).toBeNull();
  });
});
