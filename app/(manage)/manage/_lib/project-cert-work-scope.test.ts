import { describe, expect, it } from "vitest";
import { buildCertRecord, certToDraftFields, emptyProjectCertDraft } from "./project-cert";
import { WORK_SCOPE_CEL_TYPE, type WorkScopeCel } from "@/app/_lib/work-scope-cel";

const cel: WorkScopeCel = {
  $type: WORK_SCOPE_CEL_TYPE,
  expression: "scope.hasAny(['reforestation', 'agroforestry'])",
  usedTags: [
    { uri: "at://did:plc:x/org.hypercerts.workscope.tag/reforestation", cid: "bafy1" },
    { uri: "at://did:plc:x/org.hypercerts.workscope.tag/agroforestry", cid: "bafy2" },
  ],
  version: "v1",
  createdAt: "2026-07-27T00:00:00.000Z",
};

const draft = { ...emptyProjectCertDraft, title: "Test" };

describe("buildCertRecord work scope", () => {
  it("writes the CEL arm it is handed", () => {
    expect(buildCertRecord(draft, { workScope: cel }).workScope).toEqual(cel);
  });

  it("clears the scope on null and leaves it untouched on undefined", () => {
    const existing = { workScope: cel, createdAt: "2026-01-01T00:00:00.000Z" };
    expect(buildCertRecord(draft, { existing, workScope: null })).not.toHaveProperty("workScope");
    expect(buildCertRecord(draft, { existing }).workScope).toEqual(cel);
  });

  it("never writes the legacy string arm", () => {
    const record = buildCertRecord({ ...draft, scopes: ["reforestation"], customScope: "agroforestry" }, { workScope: cel });
    expect(JSON.stringify(record)).not.toContain("workScopeString");
  });
});

describe("certToDraftFields work scope", () => {
  it("hydrates a CEL scope instead of dropping it (the ECO-782 data-loss bug)", () => {
    expect(certToDraftFields({ workScope: cel })).toMatchObject({
      scopes: ["reforestation"],
      customScope: "agroforestry",
    });
  });

  it("still hydrates the legacy string arm", () => {
    expect(
      certToDraftFields({
        workScope: { $type: "org.hypercerts.claim.activity#workScopeString", scope: "Nature monitoring, agroforestry" },
      }),
    ).toMatchObject({ scopes: ["biodiversity_monitoring"], customScope: "agroforestry" });
  });

  it("re-keys a legacy record saved with translated labels", () => {
    expect(
      certToDraftFields({
        workScope: { $type: "org.hypercerts.claim.activity#workScopeString", scope: "Reforestasi, Pemantauan alam" },
      }),
    ).toMatchObject({ scopes: ["reforestation", "biodiversity_monitoring"], customScope: "" });
  });

  it("survives a missing or unknown work scope", () => {
    expect(certToDraftFields({})).toMatchObject({ scopes: [], customScope: "" });
    expect(certToDraftFields(null)).toMatchObject({ scopes: [], customScope: "" });
  });

  it("round-trips CEL → draft → CEL selection without loss", () => {
    const hydrated = certToDraftFields({ workScope: cel });
    const rebuilt = buildCertRecord({ ...draft, ...hydrated }, { workScope: cel });
    expect(certToDraftFields(rebuilt)).toMatchObject({
      scopes: hydrated.scopes,
      customScope: hydrated.customScope,
    });
  });
});
