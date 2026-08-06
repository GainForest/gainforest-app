import { afterEach, describe, expect, it, vi } from "vitest";
import { indexerQuery, indexerQueryStrict } from "./indexer";

describe("indexer query error handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects partial GraphQL results on the strict path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { appGainforestFeedPost: { edges: [] } },
            errors: [{ message: "One registration edge could not be resolved." }],
          }),
          { status: 400 },
        ),
      ),
    );

    await expect(indexerQueryStrict("query Registrants { appGainforestFeedPost { edges { node { did } } } }", {}))
      .rejects.toThrow("One registration edge could not be resolved.");
  });

  it("retains partial-data support on the default path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { appGainforestFeedPost: { edges: [] } },
            errors: [{ message: "Optional field unavailable." }],
          }),
          { status: 400 },
        ),
      ),
    );

    await expect(indexerQuery("query Registrants { appGainforestFeedPost { edges { node { did } } } }", {}))
      .resolves.toEqual({ appGainforestFeedPost: { edges: [] } });
  });
});
