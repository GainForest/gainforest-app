import { describe, expect, it } from "vitest";
import { projectScopeUris, resolveObservationFilterUris } from "./observation-scope";

const A = "at://did:plc:x/app.gainforest.dwc.occurrence/a";
const B = "at://did:plc:x/app.gainforest.dwc.occurrence/b";
const C = "at://did:plc:x/app.gainforest.dwc.occurrence/c";
const PROJECT = "at://did:plc:x/org.hypercerts.collection/p";

describe("projectScopeUris", () => {
  it("does not filter when no project is in scope", () => {
    expect(projectScopeUris(null, null)).toBeNull();
    expect(projectScopeUris(null, [A])).toBeNull();
  });

  it("keeps only the project's own sightings", () => {
    expect([...(projectScopeUris(PROJECT, [A, B]) ?? [])]).toEqual([A, B]);
  });

  it("shows nothing — not everything — while the project's sightings are unknown", () => {
    // The grouping is still loading, or the project has no sightings yet.
    expect(projectScopeUris(PROJECT, null)?.size).toBe(0);
    expect(projectScopeUris(PROJECT, [])?.size).toBe(0);
  });
});

describe("resolveObservationFilterUris", () => {
  it("passes the project scope through when no folder is open", () => {
    expect(resolveObservationFilterUris(null, null)).toBeNull();
    expect([...(resolveObservationFilterUris(new Set([A]), null) ?? [])]).toEqual([A]);
  });

  it("filters by folder alone outside a project", () => {
    expect([...(resolveObservationFilterUris(null, [A, B]) ?? [])]).toEqual([A, B]);
  });

  it("shows only the project's share of a folder", () => {
    expect([...(resolveObservationFilterUris(new Set([A, C]), [A, B]) ?? [])]).toEqual([A]);
  });

  it("shows nothing when a folder holds none of the project's sightings", () => {
    expect(resolveObservationFilterUris(new Set([C]), [A, B])?.size).toBe(0);
  });
});
