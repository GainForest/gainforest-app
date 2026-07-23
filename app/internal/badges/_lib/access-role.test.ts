import { describe, expect, it } from "vitest";
import { normalizeCgsRole } from "./access-role";

describe("normalizeCgsRole", () => {
  it.each(["owner", "admin", "member"])("keeps the known %s role", (role) => {
    expect(normalizeCgsRole(role)).toBe(role);
  });

  it.each([undefined, null, "", "moderator", "unknown"])("denies unknown role %s", (role) => {
    expect(normalizeCgsRole(role)).toBeNull();
  });
});
