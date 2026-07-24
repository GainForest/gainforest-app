import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const feed = read("./FeedClient.tsx");
const feedActions = read("./FeedActions.tsx");
const loading = read("../_components/PageLoadingSkeletons.tsx");
const explorer = read("../_components/RecordExplorer.tsx");
const drawer = read("../_components/RecordDrawer.tsx");
const observationPage = read("../observations/[did]/[rkey]/page.tsx");
const observationDetails = read("../observations/[did]/[rkey]/_components/ObservationDetailsSection.tsx");
const suggestions = read("../observations/[did]/[rkey]/_components/SpeciesSuggestions.tsx");
const identifications = read("../identifications/_components/IdentificationsClient.tsx");
const leaderboard = read("../leaderboard/LeaderboardClient.tsx");
const soundscape = read("../soundscape/_components/SoundscapeClient.tsx");
const soundscapePage = read("../soundscape/page.tsx");
const observationsLoading = read("../observations/loading.tsx");

const headingSources = [
  ["Feed", feed],
  ["record explorer", explorer],
  ["record drawer", drawer],
  ["observation page", observationPage],
  ["observation details", observationDetails],
  ["species suggestions", suggestions],
  ["identifications", identifications],
  ["leaderboard", leaderboard],
  ["Soundscape", soundscape],
  ["Soundscape page", soundscapePage],
] as const;

describe("Feed wave visual hierarchy", () => {
  it("keeps Feed rows divided and borderless while giving standalone states contrast", () => {
    expect(feed.match(/className="relative divide-y divide-border\/50"/g)).toHaveLength(2);
    expect(feed.match(/className="rounded-2xl bg-muted px-4 py-16 text-center"/g)).toHaveLength(2);
    expect(feed).toContain('className="group flex gap-3 rounded-2xl px-3 pb-1.5 pt-3.5 transition-colors hover:bg-muted/40"');
  });

  it("renders Feed loading as rows rather than cards", () => {
    const feedSkeleton = loading.slice(
      loading.indexOf("export function FeedPageSkeleton"),
      loading.indexOf("export function BioblitzPageSkeleton"),
    );
    const rowTags = feedSkeleton.match(/<article\b[^>]*>/gs) ?? [];

    expect(feedSkeleton).toContain('className="divide-y divide-border/50"');
    expect(rowTags).toHaveLength(1);
    expect(rowTags[0]).toContain('className="px-3 py-3"');
    expect(rowTags[0]).not.toMatch(/\b(?:border|bg-card|shadow)/);
  });

  it("uses italic Instrument for every semantic heading in the reviewed route wave", () => {
    for (const [label, source] of headingSources) {
      const headings = source.match(/<h[1-6]\b[^>]*>/gs) ?? [];
      expect(headings.length, `${label} should contain a semantic heading`).toBeGreaterThan(0);
      for (const heading of headings) {
        expect(heading, `${label}: ${heading}`).toMatch(/font-instrument|--font-instrument-serif-var/);
        expect(heading, `${label}: ${heading}`).toMatch(/italic|fontStyle:\s*"italic"/);
      }
    }
  });

  it("uses a visible observation empty surface without residual Garamond", () => {
    expect(explorer).not.toContain("font-garamond");
    expect(explorer).toContain('className="flex flex-col items-center justify-center rounded-2xl bg-muted px-6 py-16 text-center"');
  });

  it("strengthens identification empty surfaces without changing destructive errors", () => {
    expect(identifications).toContain("rounded-2xl bg-muted px-4 py-12 text-center");
    expect(identifications).not.toContain("rounded-3xl border border-border bg-muted");
    expect(identifications).toContain("font-instrument text-lg italic");
    expect(identifications).toContain("rounded-2xl bg-destructive/10");
    expect(identifications).not.toContain("border-dashed border-border bg-muted/30");
  });

  it("uses semantic display headings and visible muted surfaces in Soundscape", () => {
    expect(soundscape).toContain("font-instrument text-lg italic");
    expect(soundscape).toContain("rounded-2xl border border-dashed bg-muted/60");
    expect(soundscape).toContain("rounded-xl bg-muted p-3");
  });

  it("lets leaderboard tabs size to their controls and matches observation loading to square tiles", () => {
    expect(leaderboard).toContain('className="grid w-full grid-cols-3 rounded-full');
    expect(leaderboard).not.toContain('className="grid h-10 w-full grid-cols-3 rounded-full');
    expect(observationsLoading).toContain('variant="observations"');
    expect(loading).toContain('className="aspect-square rounded-lg"');
  });

  it("keeps persistent composer and drawer groups visibly filled", () => {
    expect(feedActions).toContain(
      "rounded-2xl border border-border/60 bg-muted p-3 transition-colors",
    );
    expect(drawer).toContain('"rounded-2xl bg-muted p-3.5"');
    expect(drawer).toContain(
      'className="mt-5 rounded-2xl border border-border-soft bg-muted p-4"',
    );
    expect(drawer).not.toContain("bg-foreground/[0.04]");
  });
});
