import { afterEach, describe, expect, it, vi } from "vitest";

async function loadIndexerUrl(): Promise<string> {
  vi.resetModules();
  const urls = await import("./urls");
  return urls.INDEXER_URL;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("INDEXER_URL", () => {
  it("defaults to the production GainForest indexer when the env var is blank", async () => {
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "");

    await expect(loadIndexerUrl()).resolves.toBe("https://api.hi.gainforest.app/graphql");
  });

  it("uses NEXT_PUBLIC_INDEXER_URL when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", " https://dev-api-hi.gainforest.app/graphql ");

    await expect(loadIndexerUrl()).resolves.toBe("https://dev-api-hi.gainforest.app/graphql");
  });
});
