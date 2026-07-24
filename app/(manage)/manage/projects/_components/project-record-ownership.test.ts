import { describe, expect, it } from "vitest";
import { isReliablyOwnProjectRecord } from "./project-record-ownership";

describe("isReliablyOwnProjectRecord", () => {
  it("accepts a project in the personal target repository", () => {
    expect(isReliablyOwnProjectRecord({
      kind: "personal",
      did: "did:plc:alice",
      currentUserDid: "did:plc:alice",
      recordDid: "did:plc:alice",
    })).toBe(true);
  });

  it("rejects a project from another repository", () => {
    expect(isReliablyOwnProjectRecord({
      kind: "personal",
      did: "did:plc:alice",
      currentUserDid: "did:plc:alice",
      recordDid: "did:plc:bob",
    })).toBe(false);
  });

  it("never infers member ownership from an organization repository", () => {
    expect(isReliablyOwnProjectRecord({
      kind: "group",
      did: "did:plc:forest-group",
      currentUserDid: "did:plc:member",
      recordDid: "did:plc:forest-group",
    })).toBe(false);
  });
});
