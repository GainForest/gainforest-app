import { describe, expect, it } from "vitest";
import { canViewIdentificationsRoute } from "./route-access";

describe("identifications route access", () => {
  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ])("requires both feature access and moderator access", (featureEnabled, isModerator, expected) => {
    expect(canViewIdentificationsRoute(featureEnabled, isModerator)).toBe(expected);
  });
});
