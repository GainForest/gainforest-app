import { describe, expect, it } from "vitest";
import { clampDonationMessage, DONATION_MESSAGE_MAX_LENGTH, sanitizeDonationMessage } from "./message";

describe("sanitizeDonationMessage", () => {
  it("returns null for blank or non-string input (blank changes nothing)", () => {
    expect(sanitizeDonationMessage(undefined)).toBeNull();
    expect(sanitizeDonationMessage(null)).toBeNull();
    expect(sanitizeDonationMessage(42)).toBeNull();
    expect(sanitizeDonationMessage("")).toBeNull();
    expect(sanitizeDonationMessage("   \n  ")).toBeNull();
  });

  it("trims surrounding whitespace and normalises newlines", () => {
    expect(sanitizeDonationMessage("  Bioblitz winner!  ")).toBe("Bioblitz winner!");
    expect(sanitizeDonationMessage("line 1\r\nline 2")).toBe("line 1\nline 2");
  });

  it("clamps to the maximum length", () => {
    const long = "a".repeat(DONATION_MESSAGE_MAX_LENGTH + 50);
    expect(sanitizeDonationMessage(long)).toHaveLength(DONATION_MESSAGE_MAX_LENGTH);
  });


  it("clamps at a Unicode code-point boundary", () => {
    const message = `${"a".repeat(DONATION_MESSAGE_MAX_LENGTH - 1)}🌳z`;
    const result = sanitizeDonationMessage(message);
    expect(result).toBe(`${"a".repeat(DONATION_MESSAGE_MAX_LENGTH - 1)}🌳`);
    expect(Array.from(result ?? "")).toHaveLength(DONATION_MESSAGE_MAX_LENGTH);
    expect(clampDonationMessage(message)).toBe(result);
  });

  it("keeps a normal short message intact", () => {
    expect(sanitizeDonationMessage("Thank you for protecting the forest 🌳")).toBe(
      "Thank you for protecting the forest 🌳",
    );
  });
});
