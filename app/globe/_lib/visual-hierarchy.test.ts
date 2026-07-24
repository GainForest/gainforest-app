import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const headingSources = [
  "app/globe/_components/GlobeExplorer.tsx",
  "app/equipment/[did]/[rkey]/page.tsx",
  "app/equipment/[did]/[rkey]/AssetDetailPrimitives.tsx",
  "app/deployments/[did]/[rkey]/page.tsx",
  "app/deployments/[did]/[rkey]/DeploymentLocationMap.tsx",
  "app/deployments/[did]/[rkey]/DeploymentRecordings.tsx",
  "app/account/_components/EquipmentEditor.tsx",
  "app/audiomoth/_components/deployment-shared.tsx",
  "app/_components/RecordingsExplorer.tsx",
];

describe("geo visual hierarchy", () => {
  it("keeps every route and dialog heading in italic Instrument", () => {
    for (const path of headingSources) {
      const headings = read(path).match(/<(?:h[1-6]|DialogTitle)\b[^>]*>/g) ?? [];
      expect(headings.length, `${path} should contain a heading`).toBeGreaterThan(0);
      for (const heading of headings) {
        expect(heading, `${path}: ${heading}`).toContain("font-instrument");
        expect(heading, `${path}: ${heading}`).toContain("italic");
      }
    }
  });

  it("keeps meaningful detail, empty, and error groups rounded and visible", () => {
    const globe = read("app/globe/_components/GlobeExplorer.tsx");
    const equipment = read("app/equipment/[did]/[rkey]/page.tsx");
    const deployment = read("app/deployments/[did]/[rkey]/page.tsx");
    const locationMap = read("app/deployments/[did]/[rkey]/DeploymentLocationMap.tsx");
    const recordings = read("app/deployments/[did]/[rkey]/DeploymentRecordings.tsx");

    expect(globe).toContain('className="sr-only font-instrument italic"');
    expect(globe).toContain("mb-3 overflow-hidden rounded-xl bg-white/10 px-2 py-2");
    expect(globe).toContain("rounded-xl bg-destructive/10 p-3 text-sm text-destructive");
    expect(globe).toContain("mx-4 my-3 rounded-xl bg-white/10 p-3 text-sm text-muted-foreground");
    expect(globe).not.toContain("mb-3 bg-white/[0.04] px-2 py-2");
    expect(equipment).toContain("rounded-2xl bg-muted/60");
    expect(deployment).toContain("rounded-2xl bg-muted/60");
    expect(locationMap).toContain("rounded-2xl border border-border bg-muted/60");
    expect(recordings).toContain('role="alert" className="mt-4 rounded-xl bg-destructive/10');
  });
});
