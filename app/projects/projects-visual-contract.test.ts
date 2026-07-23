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

describe("projects visual hierarchy source contract", () => {
  it("uses italic Instrument for every visible projects heading", () => {
    const visibleHeadings = [...projectsSource.matchAll(/<h[1-6][^>]*className="([^"]+)"/g)];

    expect(visibleHeadings.length).toBeGreaterThan(0);
    for (const [, className] of visibleHeadings) {
      expect(className, `heading class: ${className}`).toContain("font-instrument");
      expect(className, `heading class: ${className}`).toContain("italic");
    }
  });

  it("keeps the category group prominent with rounded contrasting choices", () => {
    expect(projectsSource).toContain(
      'className="mt-8 rounded-3xl bg-muted px-4 py-5 sm:px-6"',
    );
    expect(projectsSource).toContain(
      '"group flex min-h-20 flex-col items-start justify-between rounded-2xl p-3 text-left transition-colors motion-reduce:transition-none"',
    );
    expect(projectsSource).toContain(
      '"bg-background text-foreground hover:bg-background/80"',
    );
  });

  it("keeps featured, support, catalog, empty, error, and list surfaces rounded and visible", () => {
    expect(projectsSource).toContain(
      '"group relative h-full min-w-0 overflow-hidden rounded-2xl bg-muted"',
    );
    expect(projectsSource).toContain(
      'className="mt-14 rounded-3xl bg-muted px-4 py-7 sm:mt-16 sm:px-7 sm:py-9"',
    );
    expect(projectsSource).toContain(
      'className="group min-h-44 overflow-hidden rounded-2xl bg-background"',
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
      'className="flex flex-col items-center rounded-3xl bg-muted px-6 py-16 text-center"',
    );
    expect(organizationsSource).toContain(
      'className="flex flex-col items-center justify-center rounded-3xl bg-muted px-6 py-20 text-center"',
    );
    expect(organizationsSource).toContain(
      'className="flex h-full flex-col overflow-hidden rounded-2xl bg-muted"',
    );
    expect(organizationsSource).not.toMatch(/bg-muted\/(?:30|35|45)/);
  });

  it("keeps shared explorer and project-detail skeletons borderless and rounded", () => {
    expect(pageLoadingSource).toContain(
      'className="rounded-3xl bg-muted p-4 backdrop-blur"',
    );
    expect(pageLoadingSource).toContain(
      'className="overflow-hidden rounded-2xl bg-muted"',
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
    expect(certPageSource).toContain('"rounded-3xl bg-muted p-5"');
    expect(certPageSource).toContain(
      'className="rounded-3xl bg-muted p-5 sm:p-6"',
    );
    expect(certPageSource).toContain(
      'className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-3xl bg-muted"',
    );
    expect(certPageSource).toContain(
      'className="group relative block overflow-hidden rounded-2xl border border-border"',
    );
  });
});
