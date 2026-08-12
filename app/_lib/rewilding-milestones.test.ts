import { describe, expect, it } from "vitest";
import enCommon from "@/messages/en/common.json";
import esCommon from "@/messages/es/common.json";
import idCommon from "@/messages/id/common.json";
import ptCommon from "@/messages/pt/common.json";
import swCommon from "@/messages/sw/common.json";
import {
  effectiveRewildingGrantees,
  parseRewildingGranteeRecord,
  type RewildingGranteeRecord,
} from "./rewilding-grantees";
import {
  REWILDING_MILESTONES,
  doneRewildingMilestoneIds,
  effectiveRewildingMilestones,
  parseRewildingMilestoneRecord,
  type RewildingMilestoneRecord,
} from "./rewilding-milestones";

const GRANTEE_A = "did:plc:grantee-a";
const GRANTEE_B = "did:plc:grantee-b";

function event(
  subjectDid: string,
  milestoneId: RewildingMilestoneRecord["milestoneId"],
  rkey: string,
  done = true,
  createdAt = "2026-01-01T00:00:00.000Z",
): RewildingMilestoneRecord {
  return {
    rkey,
    uri: `at://did:plc:moderation/app.gainforest.rewilding.milestone/${rkey}`,
    subjectDid,
    milestoneId,
    done,
    createdAt,
  };
}

describe("rewilding milestone program copy", () => {
  const locales = {
    en: enCommon,
    es: esCommon,
    id: idCommon,
    pt: ptCommon,
    sw: swCommon,
  } as const;

  // The views look these up dynamically (`program(`${id}.title`)`), so the
  // static i18n checker cannot see them. A missing key would only show up as a
  // runtime error on the grantee's own grant page.
  for (const [locale, messages] of Object.entries(locales)) {
    it(`has a translated name and description for every milestone in ${locale}`, () => {
      const milestones = (messages as { rewildingProgram: { milestones: Record<string, unknown> } })
        .rewildingProgram.milestones;

      for (const definition of REWILDING_MILESTONES) {
        const entry = milestones[definition.id] as
          | { title?: unknown; description?: unknown }
          | undefined;
        expect(entry, `${locale} is missing ${definition.id}`).toBeDefined();
        expect(typeof entry?.title).toBe("string");
        expect((entry?.title as string).trim().length).toBeGreaterThan(0);
        expect(typeof entry?.description).toBe("string");
        expect((entry?.description as string).trim().length).toBeGreaterThan(0);
      }
    });
  }

  it("does not carry milestone copy in the data layer", () => {
    // Names and descriptions are UI copy; keeping them out of the definitions
    // is what forces every surface through the translated messages.
    for (const definition of REWILDING_MILESTONES) {
      expect(definition).not.toHaveProperty("title");
      expect(definition).not.toHaveProperty("description");
    }
  });
});

describe("effectiveRewildingMilestones", () => {
  it("lets the newest event win per grantee and milestone", () => {
    const records = [
      event(GRANTEE_A, "m1", "a1", true, "2026-01-01T00:00:00.000Z"),
      event(GRANTEE_A, "m1", "a2", false, "2026-02-01T00:00:00.000Z"),
      event(GRANTEE_A, "m2", "a3", true, "2026-01-15T00:00:00.000Z"),
    ];

    const current = effectiveRewildingMilestones(records);
    expect(current).toHaveLength(2);
    expect(current.find((r) => r.milestoneId === "m1")?.done).toBe(false);
    expect(current.find((r) => r.milestoneId === "m2")?.done).toBe(true);
  });

  it("keeps grantees independent", () => {
    const records = [
      event(GRANTEE_A, "m1", "a1", true),
      event(GRANTEE_B, "m1", "b1", false),
    ];

    expect(doneRewildingMilestoneIds(records, GRANTEE_A)).toEqual(new Set(["m1"]));
    expect(doneRewildingMilestoneIds(records, GRANTEE_B)).toEqual(new Set());
  });

  it("reports only confirmed milestones as done", () => {
    const records = [
      event(GRANTEE_A, "m1", "a1", true),
      event(GRANTEE_A, "m3", "a2", false),
    ];

    const done = doneRewildingMilestoneIds(records, GRANTEE_A);
    expect(done.has("m1")).toBe(true);
    expect(done.has("m3")).toBe(false);
  });
});

describe("parseRewildingMilestoneRecord", () => {
  const uri = "at://did:plc:moderation/app.gainforest.rewilding.milestone/abc";

  it("reads a well-formed record", () => {
    const parsed = parseRewildingMilestoneRecord({
      uri,
      value: {
        subject: GRANTEE_A,
        milestoneId: "m2",
        done: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(parsed).toMatchObject({ rkey: "abc", subjectDid: GRANTEE_A, milestoneId: "m2", done: true });
  });

  it("treats a missing `done` as confirmed, for forward compatibility", () => {
    const parsed = parseRewildingMilestoneRecord({
      uri,
      value: { subject: GRANTEE_A, milestoneId: "m1", createdAt: "2026-01-01T00:00:00.000Z" },
    });

    expect(parsed?.done).toBe(true);
  });

  it("rejects records that are not usable", () => {
    const createdAt = "2026-01-01T00:00:00.000Z";
    expect(parseRewildingMilestoneRecord(null)).toBeNull();
    // Unknown milestone id — a record from a newer program version.
    expect(
      parseRewildingMilestoneRecord({ uri, value: { subject: GRANTEE_A, milestoneId: "m9", createdAt } }),
    ).toBeNull();
    // Subject is not a DID.
    expect(
      parseRewildingMilestoneRecord({ uri, value: { subject: "someone", milestoneId: "m1", createdAt } }),
    ).toBeNull();
    // No timestamp, so it cannot be ordered against other events.
    expect(
      parseRewildingMilestoneRecord({ uri, value: { subject: GRANTEE_A, milestoneId: "m1" } }),
    ).toBeNull();
  });
});

describe("effectiveRewildingGrantees", () => {
  const enrollment = (
    subjectDid: string,
    rkey: string,
    active: boolean,
    createdAt: string,
  ): RewildingGranteeRecord => ({
    rkey,
    uri: `at://did:plc:moderation/app.gainforest.rewilding.grantee/${rkey}`,
    subjectDid,
    active,
    createdAt,
  });

  it("keeps slot order: first accepted organization first", () => {
    const records = [
      enrollment(GRANTEE_B, "b1", true, "2026-02-01T00:00:00.000Z"),
      enrollment(GRANTEE_A, "a1", true, "2026-01-01T00:00:00.000Z"),
    ];

    expect(effectiveRewildingGrantees(records).map((r) => r.subjectDid)).toEqual([
      GRANTEE_A,
      GRANTEE_B,
    ]);
  });

  it("removal frees the slot; re-adding takes a new one at the end", () => {
    const records = [
      enrollment(GRANTEE_A, "a1", true, "2026-01-01T00:00:00.000Z"),
      enrollment(GRANTEE_B, "b1", true, "2026-01-02T00:00:00.000Z"),
      // A is removed, then accepted again after B.
      enrollment(GRANTEE_A, "a2", false, "2026-01-03T00:00:00.000Z"),
      enrollment(GRANTEE_A, "a3", true, "2026-01-04T00:00:00.000Z"),
    ];

    const current = effectiveRewildingGrantees(records);
    expect(current.map((r) => r.subjectDid)).toEqual([GRANTEE_B, GRANTEE_A]);
  });

  it("a removed organization holds no slot", () => {
    const records = [
      enrollment(GRANTEE_A, "a1", true, "2026-01-01T00:00:00.000Z"),
      enrollment(GRANTEE_A, "a2", false, "2026-01-02T00:00:00.000Z"),
    ];

    expect(effectiveRewildingGrantees(records)).toHaveLength(0);
  });
});

describe("parseRewildingGranteeRecord", () => {
  const uri = "at://did:plc:moderation/app.gainforest.rewilding.grantee/abc";

  it("reads a well-formed enrollment", () => {
    const parsed = parseRewildingGranteeRecord({
      uri,
      value: { subject: GRANTEE_A, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(parsed).toMatchObject({ rkey: "abc", subjectDid: GRANTEE_A, active: true });
  });

  it("rejects records without a DID subject or timestamp", () => {
    expect(
      parseRewildingGranteeRecord({ uri, value: { subject: "someone", createdAt: "2026-01-01T00:00:00.000Z" } }),
    ).toBeNull();
    expect(parseRewildingGranteeRecord({ uri, value: { subject: GRANTEE_A } })).toBeNull();
  });
});
