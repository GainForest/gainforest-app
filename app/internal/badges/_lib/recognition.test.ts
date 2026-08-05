import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalBadgeData } from "./badge-records";

const { fetchInternalBadgeDataStrict } = vi.hoisted(() => ({
  fetchInternalBadgeDataStrict: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/_lib/auth", () => ({ getAuthBaseUrl: () => "https://auth.example.test" }));
vi.mock("./badge-records", () => ({
  BADGE_AWARD_COLLECTION: "app.certified.badge.award",
  BADGE_DEFINITION_COLLECTION: "app.certified.badge.definition",
  fetchInternalBadgeDataStrict,
}));

import { awardRecognition } from "./recognition";

const DEFINITION = {
  uri: "at://did:plc:gainforest/app.certified.badge.definition/most-images",
  cid: "bafyreidefinition",
  title: "bioblitz-most-images-round-4",
};

function data(awards: Array<{ did: string }> = []): InternalBadgeData {
  return {
    repoDid: "did:plc:gainforest",
    definitions: [DEFINITION],
    awards: awards.map((award) => ({
      badge: { uri: DEFINITION.uri, cid: DEFINITION.cid },
      subjectDid: award.did,
    })),
    pendingAwards: [],
  } as unknown as InternalBadgeData;
}

describe("recognition award claims", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses one deterministic group-record key for a BioBlitz round prize", async () => {
    fetchInternalBadgeDataStrict.mockResolvedValue(data());
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ uri: "at://did:plc:gainforest/app.certified.badge.award/winner", cid: "bafy" }), { status: 200 }));

    await awardRecognition(
      "did:plc:gainforest",
      "session=moderator",
      "did:plc:winner",
      "bioblitz-most-images-round-4",
    );

    const request = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(request.rkey).toBe("recognition-award-bioblitz-most-images-round-4");
  });

  it("fails closed when a concurrent claim awarded a different BioBlitz winner", async () => {
    fetchInternalBadgeDataStrict
      .mockResolvedValueOnce(data())
      .mockResolvedValueOnce(data())
      .mockResolvedValueOnce(data([{ did: "did:plc:other-winner" }]));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Record already exists" }), { status: 409 }));

    await expect(
      awardRecognition(
        "did:plc:gainforest",
        "session=moderator",
        "did:plc:attempted-winner",
        "bioblitz-most-images-round-4",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
