import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function tsxFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return tsxFiles(path);
    return extname(entry.name) === ".tsx" ? [path] : [];
  });
}

const scopedFiles = [
  ...tsxFiles("app/account"),
  ...tsxFiles("app/admin"),
  ...tsxFiles("app/internal"),
  ...tsxFiles("app/invite"),
  ...tsxFiles("app/(manage)/manage"),
];

describe("account and management visual hierarchy", () => {
  it("uses italic Instrument for semantic and route-owned dialog headings", () => {
    for (const path of scopedFiles) {
      const source = read(path);
      const headings = source.match(/<h[1-6]\b[^>]*>/gs) ?? [];
      for (const heading of headings) {
        expect(heading, `${path}: semantic heading`).toContain("font-instrument");
        expect(heading, `${path}: semantic heading`).toContain("italic");
      }

      const dialogTitles = source.match(/<(?:ModalTitle|DialogTitle)\b[^>]*>/gs) ?? [];
      for (const title of dialogTitles) {
        expect(title, `${path}: dialog heading`).toContain("font-instrument");
        expect(title, `${path}: dialog heading`).toContain("italic");
      }
    }
  });

  it("keeps Settings disclosures borderless with strong rounded inner surfaces", () => {
    const source = read("app/account/_components/AccountSettingsSections.tsx");
    expect(source).toContain('<AccordionItem value={value} className="border-0">');
    expect(source).toContain("bg-muted rounded-2xl");
    expect(source).not.toContain("bg-muted rounded-xl");
    expect(source).toContain("font-instrument text-lg font-light italic text-foreground");
  });

  it("keeps representative account, admin, and manage cards visible without decorative shells", () => {
    expect(read("app/account/_components/AccountSidebar.tsx")).toContain('"rounded-3xl bg-muted"');
    expect(read("app/admin/_components/AdminTainaPanel.tsx")).toContain("rounded-2xl bg-muted p-3");
    expect(read("app/(manage)/manage/groups/_components/GroupMembers.tsx")).toContain(
      "rounded-3xl bg-muted p-5",
    );
    expect(read("app/(manage)/manage/projects/_components/ManageProjectsClient.tsx")).not.toContain(
      "rounded-2xl border border-border bg-card/40",
    );

    const datasetCards = read(
      "app/(manage)/manage/trees/_components/DatasetLandingSection.tsx",
    );
    expect(datasetCards).toContain("bg-muted/60");
    expect(datasetCards).toContain("hover:bg-muted");
    expect(datasetCards).not.toContain("hover:bg-muted/40");

    expect(read("app/(manage)/manage/trees/_components/FileDropStep.tsx")).toContain(
      'className="rounded-2xl bg-muted p-4 grid grid-cols-3',
    );
    expect(read("app/(manage)/manage/trees/_components/ColumnMappingStep.tsx")).toContain(
      'className="flex items-start gap-2 rounded-2xl bg-muted p-3',
    );
  });

  it("keeps persistent account and management states visibly separated", () => {
    expect(read("app/_components/AccountDrawer.tsx")).toContain(
      "rounded-2xl border border-border-soft bg-muted",
    );
    expect(read("app/(manage)/manage/certs/new/_components/MintCertProjectGate.tsx")).toContain(
      "rounded-2xl bg-muted px-4 py-8 text-center",
    );
    expect(read("app/(manage)/manage/observations/_components/ObservationsClient.tsx")).toContain(
      "space-y-4 rounded-2xl bg-muted p-4 sm:p-5",
    );

    const projectCerts = read(
      "app/(manage)/manage/projects/[rkey]/certs/_components/ProjectCertsManagerClient.tsx",
    );
    expect(projectCerts).toContain("rounded-2xl bg-muted transition-colors hover:bg-muted/80");
    expect(projectCerts).toContain("flex gap-4 rounded-2xl bg-muted p-4");

    expect(read("app/(manage)/manage/projects/[rkey]/gallery/_components/ProjectGalleryManagerClient.tsx")).toContain(
      "rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground",
    );
    expect(read("app/(manage)/manage/projects/_components/ManageProjectsClient.tsx")).toContain(
      "rounded-2xl bg-muted px-1 py-3 transition-colors duration-300 hover:bg-muted/80",
    );
  });
});
