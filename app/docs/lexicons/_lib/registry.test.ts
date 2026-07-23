import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Group } from "./registry";
import { lexiconHref, mainDefName, viewDef } from "./types";

vi.mock("server-only", () => ({}));

type Registry = typeof import("./registry");
let registry: Registry;

beforeAll(async () => {
  registry = await import("./registry");
});

describe("lexicon documentation registry", () => {
  it("resolves every registered NSID to a renderable schema fixture", () => {
    expect(registry.LEXICONS.length).toBeGreaterThan(0);

    for (const doc of registry.LEXICONS) {
      expect(registry.byId.get(doc.id)).toBe(doc);
      expect(registry.KNOWN_IDS.has(doc.id)).toBe(true);
      expect(registry.groupOf(doc.id)?.lexicons).toContain(doc);
      expect(lexiconHref(doc.id)).toBe(`/docs/lexicons/${doc.id}`);

      const mainName = mainDefName(doc);
      expect(doc.defs[mainName]).toBeDefined();
      for (const def of Object.values(doc.defs)) {
        expect(() => viewDef(def)).not.toThrow();
      }
    }
  });

  it("keeps each registered NSID in exactly one visible group", () => {
    const groupedIds = registry.GROUPS.flatMap((group: Group) =>
      group.lexicons.map((doc) => doc.id),
    );

    expect(new Set(groupedIds).size).toBe(groupedIds.length);
    expect(groupedIds.sort()).toEqual(registry.LEXICONS.map((doc) => doc.id).sort());
  });

  it("leaves an unknown NSID unresolved for the route not-found guard", () => {
    const unknown = "app.gainforest.unknown.fixture";

    expect(registry.byId.get(unknown)).toBeUndefined();
    expect(registry.groupOf(unknown)).toBeUndefined();
    expect(registry.KNOWN_IDS.has(unknown)).toBe(false);
  });
});
