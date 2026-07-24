import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const surfaceFiles = [
  "app/_components/FloatingTainaGuide.tsx",
  "app/_components/StatsTile.tsx",
  "app/_components/shell/UnifiedSidebar.tsx",
  "app/dashboard/StatsDashboardClient.tsx",
  "app/privacy/page.tsx",
];

describe("core visual hierarchy", () => {
  it("keeps sidebar group labels in compact functional typography", () => {
    const sidebar = read("app/_components/shell/UnifiedSidebar.tsx");
    const sectionLabel = sidebar.match(
      /<div className="([^"]+)">\s*\{sectionsT\(section\.id\)\}/,
    );

    expect(sectionLabel).not.toBeNull();
    expect(sectionLabel?.[1]).toContain("text-xs");
    expect(sectionLabel?.[1]).toContain("font-medium");
    expect(sectionLabel?.[1]).not.toContain("font-instrument");
    expect(sectionLabel?.[1]).not.toContain("italic");
    expect(sidebar).toContain("<ExploreArt />");
    expect(sidebar).toContain("animate-spin-slow");
    expect(sidebar).toContain("motion-reduce:animate-none");
    expect(sidebar).toContain('"relative h-8 w-full"');
  });

  it("does not use imperceptible persistent fills on audited core surfaces", () => {
    for (const path of surfaceFiles) {
      const persistentWeakFills = read(path)
        .split("\n")
        .filter((line) => /(?<!hover:)bg-(?:foreground\/(?:3|5)|muted\/40)\b/.test(line));
      expect(persistentWeakFills, path).toEqual([]);
    }
  });

  it("keeps auth account choices in compact muted groups with functional labels", () => {
    const authComplete = read("app/auth/complete/_components/AuthCompleteClient.tsx");
    expect(authComplete.match(/gap-2 rounded-2xl bg-muted p-2/g)).toHaveLength(2);
    expect(authComplete).toContain("gap-3 bg-background px-4");
    expect(authComplete).toContain('text-sm font-medium text-foreground');
    expect(authComplete).not.toContain('<DisplayHeading as="h2"');
  });

  it("keeps the localized Tainá launcher label inside narrow viewports", () => {
    const guide = read("app/_components/FloatingTainaGuide.tsx");
    expect(guide).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(guide).toContain("viewportSize - VIEWPORT_PADDING * 2");
    expect(guide).toContain("width: panelGeometry.width");
    expect(guide).toContain("position.x + SPRITE_W / 2 > window.innerWidth / 2");
    expect(guide).toContain('className="min-w-0 truncate"');
    expect(guide).not.toContain("absolute left-1/2 top-full");
    expect(guide).not.toContain("taina-whats-new-title");
  });
});
