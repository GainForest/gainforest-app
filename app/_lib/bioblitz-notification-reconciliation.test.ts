import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canonicalBioblitzAwardInputs } from "./bioblitz-notification-reconciliation";

const round = { id: 4, label: "Week 4" } as never;
const definition = { uri: "at://defs/most", title: "bioblitz-most-images-round-4" };
function data(dids: string[]) {
  return {
    definitions: [definition],
    awards: dids.map((did, index) => ({ badge: { uri: definition.uri }, subjectDid: did, createdAt: `2026-08-0${index + 5}T01:00:00.000Z` })),
  } as never;
}

describe("canonicalBioblitzAwardInputs", () => {
  it("derives notifications from committed awards without winner calculation", () => {
    expect(canonicalBioblitzAwardInputs(data(["did:plc:winner"]), [round]))
      .toEqual([{ roundId: 4, roundLabel: "Week 4", prize: "most-observations", winnerDid: "did:plc:winner", createdAt: "2026-08-05T01:00:00.000Z" }]);
  });

  it("allows an explicit moderator action for an older recorded award", () => {
    const old = {
      definitions: [definition],
      awards: [{ badge: { uri: definition.uri }, subjectDid: "did:plc:winner", createdAt: "2020-01-01T00:00:00.000Z" }],
    } as never;
    expect(canonicalBioblitzAwardInputs(old, [round]))
      .toEqual([{ roundId: 4, roundLabel: "Week 4", prize: "most-observations", winnerDid: "did:plc:winner", createdAt: "2020-01-01T00:00:00.000Z" }]);
  });

  it("fails closed on conflicting winners for one round prize", () => {
    expect(canonicalBioblitzAwardInputs(data(["did:plc:first", "did:plc:second"]), [round])).toEqual([]);
  });
});
