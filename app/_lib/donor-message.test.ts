import { describe, expect, it } from "vitest";
import { donorMessageFromNotes } from "@/app/_lib/donor-message";

describe("donorMessageFromNotes", () => {
  it("keeps a genuine note a donor wrote", () => {
    expect(donorMessageFromNotes("Keep up the great work! 🌳")).toBe("Keep up the great work! 🌳");
  });

  it("trims surrounding whitespace", () => {
    expect(donorMessageFromNotes("  thank you  ")).toBe("thank you");
  });

  it("returns null for empty or missing notes", () => {
    expect(donorMessageFromNotes(null)).toBeNull();
    expect(donorMessageFromNotes(undefined)).toBeNull();
    expect(donorMessageFromNotes("   ")).toBeNull();
  });

  it("drops machine-generated wallet payment notes in any currency", () => {
    expect(
      donorMessageFromNotes("0x992e91e3502a615c757ee930e8b4b599686f5ba9 paid 0.01USDC using wallet"),
    ).toBeNull();
    expect(donorMessageFromNotes("0x4654 paid 0.04 USDC using wallet")).toBeNull();
    expect(donorMessageFromNotes("0x43013Bf2D0d41b75164EE8a0938D967d7384e60E paid 3000CELO using wallet")).toBeNull();
    expect(donorMessageFromNotes("0x809C9f8 paid 9.262252CELO using wallet")).toBeNull();
  });

  it("drops machine-generated tip notes", () => {
    expect(
      donorMessageFromNotes("did:plc:abc tipped 5USDC to GainForest (gainforest.eth)"),
    ).toBeNull();
  });

  it("does not discard a real note that merely mentions paying", () => {
    expect(donorMessageFromNotes("Happy to have paid it forward for this forest")).toBe(
      "Happy to have paid it forward for this forest",
    );
  });
});
