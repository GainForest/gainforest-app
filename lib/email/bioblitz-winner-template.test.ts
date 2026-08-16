import { describe, expect, it } from "vitest";
import { renderBioblitzWinnerEmail } from "./bioblitz-winner-template";

describe("renderBioblitzWinnerEmail", () => {
  it.each([
    {
      prize: "most-observations" as const,
      category: "Highest Points",
      amount: "$40 USD",
      subject: "Congrats! You won “Highest Points” in BioBlitz Week 6 🎉",
    },
    {
      prize: "best-picture" as const,
      category: "Best Picture",
      amount: "$10 USD",
      subject: "Congrats! You won “Best Picture” in BioBlitz Week 6 🎉",
    },
  ])("confirms the $category award and explains how its payment is delivered", ({ prize, category, amount, subject }) => {
    const rendered = renderBioblitzWinnerEmail({
      locale: "en",
      roundLabel: "Week 6",
      prize,
      siteUrl: "https://gainforest.example",
    });

    expect(rendered.subject).toBe(subject);
    expect(rendered.text).toContain(`Category: ${category}`);
    expect(rendered.text).toContain(`Payment amount: ${amount}`);
    expect(rendered.html).toContain(category);
    expect(rendered.html).toContain(amount);
    for (const content of [rendered.html, rendered.text]) {
      expect(content).toContain("7–10 business days");
      expect(content).toContain("https://gainforest.example/account/wallet");
      expect(content).toContain("fatin@gainforest.net");
    }
    expect(rendered.text).toContain("Create your wallet: https://gainforest.example/account/wallet");
    expect(rendered.html).toContain('href="mailto:fatin@gainforest.net"');
  });

  it("names the board prize after the rule its round was played under", () => {
    const render = (roundId?: number) =>
      renderBioblitzWinnerEmail({
        locale: "en",
        roundLabel: "Week 6",
        prize: "most-observations",
        roundId,
        siteUrl: "https://gainforest.example",
      });

    // Rounds before the points era keep the original prize name.
    expect(render(3).subject).toBe("Congrats! You won “Most Observations” in BioBlitz Week 6 🎉");
    // Points-era rounds — and calls without a round — use the current name.
    expect(render(8).subject).toBe("Congrats! You won “Highest Points” in BioBlitz Week 6 🎉");
    expect(render(undefined).subject).toBe("Congrats! You won “Highest Points” in BioBlitz Week 6 🎉");
  });

  it.each([
    ["en", "Congrats! You won “Best Picture” in BioBlitz Week 6 🎉"],
    ["es", "¡Felicidades! Ganaste “Mejor foto” en BioBlitz Week 6 🎉"],
    ["pt", "Parabéns! Você ganhou “Melhor foto” no BioBlitz Week 6 🎉"],
    ["sw", "Hongera! Umeshinda “Picha bora” katika BioBlitz Week 6 🎉"],
    ["id", "Selamat! Anda memenangkan “Foto terbaik” di BioBlitz Week 6 🎉"],
  ] as const)("localizes the complete winner message for %s", (locale, subject) => {
    const rendered = renderBioblitzWinnerEmail({
      locale,
      roundLabel: "Week 6",
      prize: "best-picture",
      siteUrl: "https://gainforest.example",
    });

    expect(rendered.subject).toBe(subject);
    expect(rendered.html).toContain("$10 USD");
    expect(rendered.html).toContain("https://gainforest.example/account/wallet");
    expect(rendered.text).toContain("fatin@gainforest.net");
  });

  it("uses the same branded shell as the other GainForest emails", () => {
    const rendered = renderBioblitzWinnerEmail({
      locale: "en",
      roundLabel: "Week 6",
      prize: "most-observations",
      siteUrl: "https://gainforest.example",
    });

    expect(rendered.html).toContain("Instrument+Serif");
    expect(rendered.html).toContain('class="email-header"');
    expect(rendered.html).toContain("background: #3e7053");
    expect(rendered.html).toContain("https://gainforest.example/assets/media/images/app-icon.png");
    expect(rendered.html).toContain('class="email-body"');
  });
});
