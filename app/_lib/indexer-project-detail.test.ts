import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecordDetail } from "./indexer";

describe("fetchRecordDetail for projects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the collection's long description instead of its short summary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            orgHypercertsCollectionByUri: {
              description: {
                __typename: "OrgHypercertsDefsDescriptionString",
                value: "This is the full project story.",
              },
            },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRecordDetail("at://did:plc:project/org.hypercerts.collection/project-rkey"),
    ).resolves.toMatchObject({
      blurb: "This is the full project story.",
      richBody: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining("orgHypercertsCollectionByUri"),
      }),
    );
  });
});
