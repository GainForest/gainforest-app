import { describe, expect, it, vi } from "vitest";
import {
  buildWorkScopeCel,
  buildWorkScopeExpression,
  customScopeTagKey,
  decodeWorkScope,
  parseWorkScopeString,
  workScopeTermToKey,
  WORK_SCOPE_CEL_TYPE,
  WORK_SCOPE_STRING_TYPE,
} from "./work-scope-cel";
import type { WorkScopeLabels } from "./work-scope-labels";

const labels: WorkScopeLabels = {
  reforestation: "Reforestation",
  forest_protection: "Forest protection",
  biodiversity_monitoring: "Nature monitoring",
  community_stewardship: "Community stewardship",
  carbon_removal: "Carbon removal",
  restoration_maintenance: "Restoration maintenance",
};

describe("workScopeTermToKey", () => {
  it("accepts stable keys and legacy aliases", () => {
    expect(workScopeTermToKey("biodiversity_monitoring")).toBe("biodiversity_monitoring");
    expect(workScopeTermToKey("nature_monitoring")).toBe("biodiversity_monitoring");
    expect(workScopeTermToKey("Forest Protection")).toBe("forest_protection");
  });

  it("re-keys translated labels the old editor persisted", () => {
    expect(workScopeTermToKey("Nature monitoring")).toBe("biodiversity_monitoring");
    expect(workScopeTermToKey("Pemantauan alam")).toBe("biodiversity_monitoring");
    expect(workScopeTermToKey("Monitoramento da natureza")).toBe("biodiversity_monitoring");
    expect(workScopeTermToKey("Reforestasi")).toBe("reforestation");
    expect(workScopeTermToKey("Upandaji upya wa misitu")).toBe("reforestation");
  });

  it("leaves genuinely free-form terms alone", () => {
    expect(workScopeTermToKey("agroforestry")).toBeNull();
    expect(workScopeTermToKey("")).toBeNull();
  });
});

describe("parseWorkScopeString", () => {
  it("splits known keys from free text and dedupes", () => {
    expect(parseWorkScopeString("Reforestation, agroforestry, reforestation, soil health")).toEqual({
      keys: ["reforestation"],
      custom: ["agroforestry", "soil health"],
    });
  });

  it("handles a real localized record", () => {
    expect(parseWorkScopeString("Reforestasi, Perlindungan hutan, Pemanfaatan jasa lingkungan")).toEqual({
      keys: ["reforestation", "forest_protection"],
      custom: ["Pemanfaatan jasa lingkungan"],
    });
  });
});

describe("decodeWorkScope", () => {
  it("decodes the CEL arm from usedTags", () => {
    expect(
      decodeWorkScope({
        $type: WORK_SCOPE_CEL_TYPE,
        expression: "scope.hasAny(['reforestation', 'agroforestry'])",
        usedTags: [
          { uri: "at://did:plc:x/org.hypercerts.workscope.tag/reforestation" },
          { uri: "at://did:plc:x/org.hypercerts.workscope.tag/agroforestry" },
        ],
        version: "v1",
      }),
    ).toEqual({ keys: ["reforestation"], custom: ["agroforestry"] });
  });

  it("falls back to the expression when usedTags is empty", () => {
    expect(
      decodeWorkScope({
        $type: WORK_SCOPE_CEL_TYPE,
        expression: 'scope.hasAny(["forest_protection", "carbon_removal"])',
        usedTags: [],
      }),
    ).toEqual({ keys: ["forest_protection", "carbon_removal"], custom: [] });
  });

  it("decodes the legacy string arm", () => {
    expect(decodeWorkScope({ $type: WORK_SCOPE_STRING_TYPE, scope: "reforestation, agroforestry" })).toEqual({
      keys: ["reforestation"],
      custom: ["agroforestry"],
    });
  });

  it("sniffs the shape when $type is missing", () => {
    expect(decodeWorkScope({ scope: "Carbon removal" })).toEqual({ keys: ["carbon_removal"], custom: [] });
    expect(decodeWorkScope({ expression: "scope.hasAny(['carbon_removal'])" })).toEqual({
      keys: ["carbon_removal"],
      custom: [],
    });
  });

  it("returns an empty selection for absent or unknown shapes", () => {
    expect(decodeWorkScope(undefined)).toEqual({ keys: [], custom: [] });
    expect(decodeWorkScope(null)).toEqual({ keys: [], custom: [] });
    expect(decodeWorkScope({ $type: "org.example.somethingElse", whatever: 1 })).toEqual({ keys: [], custom: [] });
  });
});

describe("buildWorkScopeExpression", () => {
  it("emits hasAny over tag keys, custom terms slugified", () => {
    expect(buildWorkScopeExpression({ keys: ["reforestation"], custom: ["Soil health"] })).toBe(
      "scope.hasAny(['reforestation', 'soil-health'])",
    );
  });
});

describe("customScopeTagKey", () => {
  it("slugifies, strips accents and never returns empty", () => {
    expect(customScopeTagKey("Água & Solo")).toBe("agua-solo");
    expect(customScopeTagKey("  !!!  ")).toBe("custom");
  });
});

describe("buildWorkScopeCel", () => {
  const client = (existing: string[] = []) => ({
    getRecord: vi.fn(async (_c: string, rkey: string) =>
      existing.includes(rkey) ? { uri: `at://did:plc:x/org.hypercerts.workscope.tag/${rkey}`, cid: "bafyOld" } : null,
    ),
    createRecord: vi.fn(async (_c: string, _r: Record<string, unknown>, rkey?: string) => ({
      uri: `at://did:plc:x/org.hypercerts.workscope.tag/${rkey}`,
      cid: "bafyNew",
    })),
  });

  it("returns null when nothing is selected, so callers can clear the field", async () => {
    await expect(buildWorkScopeCel({ keys: [], custom: [] }, { client: client(), labels })).resolves.toBeNull();
  });

  it("reuses existing tag records and creates only the missing ones", async () => {
    const c = client(["reforestation"]);
    const cel = await buildWorkScopeCel({ keys: ["reforestation", "carbon_removal"], custom: [] }, { client: c, labels });
    expect(cel?.$type).toBe(WORK_SCOPE_CEL_TYPE);
    expect(cel?.version).toBe("v1");
    expect(cel?.usedTags.map((t) => t.uri)).toEqual([
      "at://did:plc:x/org.hypercerts.workscope.tag/reforestation",
      "at://did:plc:x/org.hypercerts.workscope.tag/carbon_removal",
    ]);
    expect(c.createRecord).toHaveBeenCalledTimes(1);
    expect(c.createRecord.mock.calls[0]?.[1]).toMatchObject({ key: "carbon_removal", name: "Carbon removal", category: "topic" });
  });

  it("names a custom tag with the term the user typed", async () => {
    const c = client();
    await buildWorkScopeCel({ keys: [], custom: ["Soil health"] }, { client: c, labels });
    expect(c.createRecord.mock.calls[0]?.[1]).toMatchObject({ key: "soil-health", name: "Soil health" });
  });

  it("recovers when a concurrent publish already created the tag", async () => {
    const c = client();
    c.createRecord.mockRejectedValueOnce(new Error("conflict"));
    c.getRecord
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ uri: "at://did:plc:x/org.hypercerts.workscope.tag/reforestation", cid: "bafyRaced" });
    const cel = await buildWorkScopeCel({ keys: ["reforestation"], custom: [] }, { client: c, labels });
    expect(cel?.usedTags).toEqual([{ uri: "at://did:plc:x/org.hypercerts.workscope.tag/reforestation", cid: "bafyRaced" }]);
  });

  it("round-trips through decodeWorkScope", async () => {
    const selection = { keys: ["reforestation", "biodiversity_monitoring"] as const, custom: ["agroforestry"] };
    const cel = await buildWorkScopeCel({ keys: [...selection.keys], custom: selection.custom }, { client: client(), labels });
    expect(decodeWorkScope(cel)).toEqual({
      keys: ["reforestation", "biodiversity_monitoring"],
      custom: ["agroforestry"],
    });
  });
});
