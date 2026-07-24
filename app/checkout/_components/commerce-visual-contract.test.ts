import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(`${process.cwd()}/app${path}`, "utf8");
}

const headingFiles = [
  "/cart/_components/CartView.tsx",
  "/checkout/_components/CheckoutView.tsx",
  "/cards/_components/MyCardsView.tsx",
  "/account/_components/DonationHistory.tsx",
  "/_components/Dashboard.tsx",
  "/_components/GrantsClient.tsx",
  "/leaderboard/LeaderboardClient.tsx",
];

describe("commerce visual contract", () => {
  it("keeps every direct semantic heading in Instrument Serif italic", () => {
    for (const path of headingFiles) {
      const classes = [...source(path).matchAll(/<h[1-6]\b[^>]*className="([^"]*)"/g)].map((match) => match[1]);
      for (const className of classes) {
        expect(className, `${path}: ${className}`).toContain("font-instrument");
        expect(className, `${path}: ${className}`).toContain("italic");
      }
    }
  });

  it("does not regress audited commerce groups to weak surface fills", () => {
    const audited: Array<[string, string[]]> = [
      ["/cart/_components/CartView.tsx", ["bg-muted/50"]],
      ["/checkout/_components/CheckoutView.tsx", ["bg-muted/50"]],
      ["/cards/_components/MyCardsView.tsx", ["bg-muted/50"]],
      ["/account/_components/DonationHistory.tsx", ["bg-muted/30", "bg-muted/50", "bg-background/70"]],
      ["/_components/GrantsClient.tsx", ["bg-muted/20", "bg-muted/30", "bg-muted/40", "bg-muted/50"]],
      ["/_components/Dashboard.tsx", ["bg-muted/40", "bg-muted/55", "bg-foreground/5"]],
      ["/_components/DonationsHub.tsx", ["bg-muted/55"]],
      ["/leaderboard/LeaderboardClient.tsx", ["bg-muted/55", "bg-card/70", "bg-card/75", "bg-card/80"]],
    ];

    for (const [path, forbidden] of audited) {
      const contents = source(path);
      for (const token of forbidden) expect(contents, `${path}: ${token}`).not.toContain(token);
    }
  });

  it("uses route-local loading hierarchy and preserves production test adapters", () => {
    expect(source("/grants/page.tsx")).toContain("<GrantsLoadingView />");
    expect(source("/donations/page.tsx")).toContain("<DonationsLoadingView />");
    expect(source("/grants/page.tsx")).not.toContain("PageLoadingSkeletons");
    expect(source("/donations/page.tsx")).not.toContain("PageLoadingSkeletons");

    const donationFixture = source("/%5Ftest/donation-flow/_components/DonationFlowExperienceClient.tsx");
    const cardsFixture = source("/%5Ftest/my-cards/_components/MyCardsExperienceClient.tsx");
    expect(donationFixture).toContain("CheckoutView");
    expect(donationFixture).toContain('sideEffects="mock"');
    expect(cardsFixture).toContain("MyCardsView");
  });
});
