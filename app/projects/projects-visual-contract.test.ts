import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectsSource = readFileSync(
  new URL("./ProjectsExploreClient.tsx", import.meta.url),
  "utf8",
);
const projectListSource = readFileSync(
  new URL("../_components/ProjectListItem.tsx", import.meta.url),
  "utf8",
);
const organizationsSource = readFileSync(
  new URL("../organizations/OrganizationsClient.tsx", import.meta.url),
  "utf8",
);
const pageLoadingSource = readFileSync(
  new URL("../_components/PageLoadingSkeletons.tsx", import.meta.url),
  "utf8",
);
const certPageSource = readFileSync(
  new URL("../cert/[did]/[rkey]/page.tsx", import.meta.url),
  "utf8",
);
const projectDetailSource = readFileSync(
  new URL("./[did]/[rkey]/page.tsx", import.meta.url),
  "utf8",
);
const bumicertCardSource = readFileSync(
  new URL("../../components/bumicert/BumicertCard.tsx", import.meta.url),
  "utf8",
);
const bumicertsCardSource = readFileSync(
  new URL("../../components/bumicert/BumicertsBumicertCard.tsx", import.meta.url),
  "utf8",
);
const natureEvidenceSource = readFileSync(
  new URL("../cert/[did]/[rkey]/_components/timeline/EvidenceAdder/NatureEvidencePicker.tsx", import.meta.url),
  "utf8",
);
const evidenceListSource = readFileSync(
  new URL("../cert/[did]/[rkey]/_components/timeline/EvidenceAdder/ListHelpers.tsx", import.meta.url),
  "utf8",
);
const fileEvidenceSource = readFileSync(
  new URL("../cert/[did]/[rkey]/_components/timeline/EvidenceAdder/FileEvidencePicker.tsx", import.meta.url),
  "utf8",
);
const timelineNoteSource = readFileSync(
  new URL("../cert/[did]/[rkey]/_components/timeline/viewers/shared/TimelineOptionalNote.tsx", import.meta.url),
  "utf8",
);
const textPreviewSource = readFileSync(
  new URL("../cert/[did]/[rkey]/_components/timeline/viewers/renderers/previews/TextPreviewRenderer.tsx", import.meta.url),
  "utf8",
);
const documentPreviewSource = readFileSync(
  new URL("../cert/[did]/[rkey]/_components/timeline/viewers/renderers/previews/DocumentPreviewRenderer.tsx", import.meta.url),
  "utf8",
);

describe("projects visual hierarchy source contract", () => {
  it("uses italic Instrument for every visible projects heading", () => {
    const visibleHeadings = [...projectsSource.matchAll(/<h[1-6][^>]*className="([^"]+)"/g)];

    expect(visibleHeadings.length).toBeGreaterThan(0);
    for (const [, className] of visibleHeadings) {
      expect(className, `heading class: ${className}`).toContain("font-instrument");
      expect(className, `heading class: ${className}`).toContain("italic");
    }
  });

  it("keeps self-explanatory category choices open in the page flow", () => {
    expect(projectsSource).toContain(
      '<section aria-label={t("categories.title")} className="mt-6">',
    );
    expect(projectsSource).toContain(
      '"group flex min-h-20 flex-col items-start justify-between rounded-2xl p-3 text-left transition-colors motion-reduce:transition-none"',
    );
    expect(projectsSource).toContain(
      '"bg-muted text-foreground hover:bg-muted/80"',
    );
    expect(projectsSource).not.toContain("project-categories-heading");
  });

  it("keeps featured, support, catalog, empty, error, and list surfaces rounded and visible", () => {
    expect(projectsSource).toContain(
      '"group relative flex min-w-0 self-stretch overflow-hidden rounded-2xl bg-muted"',
    );
    expect(projectsSource).toContain(
      '"flex items-stretch snap-x snap-mandatory gap-4',
    );
    expect(projectsSource).toContain(
      'className="mt-10 rounded-3xl bg-muted p-4 sm:mt-12 sm:p-5"',
    );
    expect(projectsSource).toContain(
      'className="group h-full overflow-hidden rounded-2xl bg-background"',
    );
    expect(projectsSource).toContain(
      'className="group relative h-full overflow-hidden rounded-2xl bg-muted animate-in"',
    );
    expect(projectsSource).toContain(
      'className="flex flex-col items-center rounded-3xl bg-muted px-6 py-16 text-center"',
    );
    expect(projectsSource).toContain(
      'className="flex flex-col items-center justify-center rounded-3xl bg-muted px-6 py-20 text-center animate-in"',
    );
    expect(projectsSource).toContain(
      'className="overflow-hidden rounded-2xl bg-muted divide-y divide-background"',
    );
    expect(projectListSource).toContain("hover:bg-background/70");
  });

  it("keeps the featured shelf concise and its carousel peers structurally equal", () => {
    const featuredSource = projectsSource.slice(
      projectsSource.indexOf("function FeaturedProjects"),
      projectsSource.indexOf("function FeaturedProjectCard"),
    );

    expect(featuredSource).not.toContain('t("description")');
    expect(featuredSource).toContain("items-stretch");
    expect(projectsSource).toContain("self-stretch");
  });

  it("does not regress primary project groups or cards to imperceptible muted opacity", () => {
    expect(projectsSource).not.toMatch(/bg-muted\/(?:30|35|45)/);
  });

  it("keeps organization cards, lists, states, and skeletons rounded and separated", () => {
    expect(organizationsSource).toContain(
      'className="flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl bg-muted transition-colors hover:bg-muted/80 motion-reduce:transition-none"',
    );
    expect(organizationsSource).toContain(
      'className="overflow-hidden rounded-2xl bg-muted divide-y divide-background"',
    );
    expect(organizationsSource).toContain(
      'className="flex flex-col items-center rounded-2xl bg-muted px-4 py-12 text-center sm:px-5"',
    );
    expect(organizationsSource).toContain(
      'className="flex flex-col items-center justify-center rounded-2xl bg-muted px-4 py-12 text-center sm:px-5"',
    );
    expect(organizationsSource).toContain(
      'className="flex h-full flex-col overflow-hidden rounded-2xl bg-muted"',
    );
    expect(organizationsSource).toContain(
      'grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]',
    );
    expect(organizationsSource).not.toMatch(/bg-muted\/(?:30|35|45)/);
  });

  it("keeps shared explorer and project-detail skeletons family-aligned", () => {
    expect(pageLoadingSource).toContain(
      'max-w-[90rem] px-3 pt-5 sm:px-5 lg:px-8',
    );
    expect(pageLoadingSource).toContain(
      'className="flex h-full flex-col overflow-hidden rounded-2xl bg-muted"',
    );
    expect(pageLoadingSource).toContain(
      'className="space-y-4 rounded-3xl bg-muted p-4 lg:sticky lg:top-24"',
    );
  });

  it("keeps shared Cert cards and public project fallback surfaces visibly separated", () => {
    expect(bumicertCardSource).toContain(
      '"group relative flex w-full flex-col overflow-hidden rounded-2xl bg-background shadow-sm transition-colors motion-reduce:transition-none"',
    );
    expect(bumicertsCardSource).toContain(
      '"group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-background shadow-sm transition-colors motion-reduce:transition-none"',
    );
    expect(projectDetailSource).toContain(
      'className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-muted"',
    );
    expect(projectDetailSource).toContain(
      'className="rounded-2xl bg-muted p-4"',
    );
  });

  it("keeps Cert grouped states rounded while preserving functional boundaries", () => {
    expect(certPageSource).toContain(
      'className="overflow-hidden rounded-2xl bg-muted divide-y divide-background"',
    );
    expect(certPageSource.match(/rounded-3xl bg-muted p-4 sm:p-5/g)).toHaveLength(2);
    expect(certPageSource).not.toContain("rounded-3xl bg-muted p-5 sm:p-6");
    expect(certPageSource).toContain(
      'className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-3xl bg-muted"',
    );
    expect(certPageSource).toContain(
      'className="group relative block overflow-hidden rounded-2xl border border-border"',
    );
  });

  it("gives nested Cert evidence and preview states clear inner contrast", () => {
    expect(natureEvidenceSource.match(/rounded-xl bg-background px-3 py-4/g)).toHaveLength(2);
    expect(evidenceListSource).toContain("rounded-xl bg-background p-5 text-center");
    expect(fileEvidenceSource).toContain(
      "rounded-xl bg-background px-3 py-2 text-center text-xs",
    );
    expect(timelineNoteSource).toContain("rounded-xl bg-background px-3 py-2");
    expect(textPreviewSource).toContain(
      "rounded-xl border border-border/60 bg-background p-4",
    );
    expect(documentPreviewSource).toContain(
      "rounded-xl border border-border/40 bg-background px-3 py-3",
    );
    expect(documentPreviewSource).toContain("rounded-lg bg-muted text-primary shadow-xs");
  });
});
