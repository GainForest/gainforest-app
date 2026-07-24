import { describe, expect, it, vi } from "vitest";
import { assignRecipients } from "./assignment-results";

describe("assignRecipients", () => {
  it("reports successful and failed recipients without stopping after a partial failure", async () => {
    const assign = vi.fn(async (recipient: string) => {
      if (recipient === "bad@example.com") throw new Error("failed");
    });

    const result = await assignRecipients(
      ["first@example.com", "bad@example.com", "last@example.com"],
      assign,
    );

    expect(assign).toHaveBeenCalledTimes(3);
    expect(result.succeeded).toEqual(["first@example.com", "last@example.com"]);
    expect(result.failed.map(({ recipient }) => recipient)).toEqual(["bad@example.com"]);
  });
});
