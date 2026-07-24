import { describe, expect, it } from "vitest";
import type { ManageTarget } from "@/lib/links";
import {
  canCreateRecord,
  canDeleteRecord,
  canEditGroupProfile,
  canUpdateRecord,
  recognizedCgsRole,
} from "./cgs-permissions";

const target = (role: ManageTarget["role"]): Pick<ManageTarget, "kind" | "role"> => ({ kind: "group", role });

describe("manage mutation permissions", () => {
  it.each([undefined, null, "", "suspended", "future-role"])("denies unknown role %s", (role) => {
    expect(recognizedCgsRole(role)).toBeNull();
    expect(canCreateRecord(target(role)).allowed).toBe(false);
    expect(canUpdateRecord(target(role), { ownRecord: true }).allowed).toBe(false);
    expect(canDeleteRecord(target(role), { ownRecord: true }).allowed).toBe(false);
    expect(canEditGroupProfile(target(role)).allowed).toBe(false);
  });

  it("keeps the recognized member policy explicit", () => {
    expect(canCreateRecord(target("member")).allowed).toBe(true);
    expect(canUpdateRecord(target("member")).allowed).toBe(false);
    expect(canUpdateRecord(target("member"), { ownRecord: true }).allowed).toBe(true);
    expect(canDeleteRecord(target("member")).allowed).toBe(false);
  });

  it.each(["owner", "admin"] as const)("allows recognized manager role %s", (role) => {
    expect(recognizedCgsRole(role)).toBe(role);
    expect(canCreateRecord(target(role)).allowed).toBe(true);
    expect(canUpdateRecord(target(role)).allowed).toBe(true);
    expect(canDeleteRecord(target(role)).allowed).toBe(true);
  });
});
