import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const headingFiles = [
  "app/_components/FloatingTainaGuide.tsx",
  "app/_components/shell/UnifiedSidebar.tsx",
];

const surfaceFiles = [
  "app/_components/FloatingTainaGuide.tsx",
  "app/_components/StatsTile.tsx",
  "app/_components/shell/UnifiedSidebar.tsx",
  "app/dashboard/StatsDashboardClient.tsx",
  "app/privacy/page.tsx",
];

describe("core visual hierarchy", () => {
  it("styles every literal core-shell heading with italic Instrument Serif", () => {
    for (const path of headingFiles) {
      const headings = [...read(path).matchAll(/<h[1-6]\b[^>]*>/gs)].map(([heading]) => heading);
      expect(headings.length, `${path} should contain headings`).toBeGreaterThan(0);
      for (const heading of headings) {
        expect(heading, `${path}: ${heading}`).toContain("font-instrument");
        expect(heading, `${path}: ${heading}`).toContain("italic");
      }
    }
  });

  it("does not use imperceptible persistent fills on audited core surfaces", () => {
    for (const path of surfaceFiles) {
      const persistentWeakFills = read(path)
        .split("\n")
        .filter((line) => /(?<!hover:)bg-(?:foreground\/(?:3|5)|muted\/40)\b/.test(line));
      expect(persistentWeakFills, path).toEqual([]);
    }
  });

  it("keeps auth account choices in rounded muted groups with contrasting inner options", () => {
    const authComplete = read("app/auth/complete/_components/AuthCompleteClient.tsx");
    expect(authComplete.match(/rounded-\[32px\] bg-muted p-1\.5/g)).toHaveLength(2);
    expect(authComplete).toContain("gap-3 bg-background px-4");
    expect(authComplete).toContain('<DisplayHeading as="h2"');
  });
});
