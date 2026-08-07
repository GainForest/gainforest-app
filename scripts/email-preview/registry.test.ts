import { describe, expect, it } from "vitest";

import { renderBioblitzWinnerEmail } from "@/lib/email/bioblitz-winner-template";
import { renderGroupInvitationEmailTemplate } from "@/lib/email/group-invitation-template";
import { renderWelcomeEmailTemplate } from "@/lib/email/welcome-template";
import { SUPPORTED_LOCALES } from "@/lib/i18n/languages";
import { EMAIL_PREVIEW_TEMPLATES, renderEmailPreview } from "./registry";

describe("email preview registry", () => {
  it("lists every current email family and its fixture variants", () => {
    expect(EMAIL_PREVIEW_TEMPLATES).toEqual([
      { id: "welcome", defaultVariant: "signup", variants: ["signup", "membership"] },
      { id: "organization-invitation", defaultVariant: "member", variants: ["member", "admin"] },
      { id: "bioblitz-winner", defaultVariant: "most-observations", variants: ["most-observations", "best-picture"] },
      { id: "otp", defaultVariant: "returning-user", variants: ["returning-user", "new-user"] },
    ]);
  });

  it("renders the exact production BioBlitz template with safe fixture data", () => {
    const preview = renderEmailPreview({
      template: "bioblitz-winner",
      variant: "best-picture",
      locale: "en",
    });

    expect(preview).toEqual({
      template: "bioblitz-winner",
      variant: "best-picture",
      locale: "en",
      ...renderBioblitzWinnerEmail({
        locale: "en",
        roundLabel: "BioBlitz Week 4",
        prize: "best-picture",
        siteUrl: "https://www.gainforest.app",
      }),
    });
  });

  it("renders welcome fixtures through the production welcome template", () => {
    const preview = renderEmailPreview({ template: "welcome", variant: "membership", locale: "pt" });

    expect(preview).toEqual({
      template: "welcome",
      variant: "membership",
      locale: "pt",
      ...renderWelcomeEmailTemplate({
        variant: "organization-invite",
        locale: "pt",
        name: "Forest Steward",
        organizationName: "Forest Circle",
        invitedByName: undefined,
        invitedByEmail: undefined,
        siteUrl: "https://www.gainforest.app",
      }),
    });
  });

  it("renders invitation fixtures through the production invitation template", () => {
    const preview = renderEmailPreview({ template: "organization-invitation", variant: "admin", locale: "sw" });

    expect(preview).toEqual({
      template: "organization-invitation",
      variant: "admin",
      locale: "sw",
      ...renderGroupInvitationEmailTemplate({
        locale: "sw",
        invitedEmail: "preview@example.com",
        organizationName: "Forest Circle",
        inviterName: "Forest Owner",
        inviterUrl: "https://www.gainforest.app/account/preview",
        role: "admin",
        acceptUrl: "https://example.com/gainforest-preview/invitation",
        siteUrl: "https://www.gainforest.app",
      }),
    });
  });

  it("substitutes representative auth-provider values into OTP previews", () => {
    const returning = renderEmailPreview({ template: "otp", variant: "returning-user", locale: "en" });
    const created = renderEmailPreview({ template: "otp", variant: "new-user", locale: "en" });

    expect(returning.subject).toBe("Sign in to GainForest");
    expect(returning.html).toContain("482913");
    expect(returning.html).toContain("Use this code to continue where you left off.");
    expect(returning.html).not.toContain("your account is being created");
    expect(created.html).toContain("your account is being created");
    expect(created.html).not.toContain("continue where you left off");
    expect(returning.html).not.toMatch(/{{[^}]+}}/);
    expect(created.html).not.toMatch(/{{[^}]+}}/);
  });

  it("renders every variant in every supported locale", () => {
    for (const definition of EMAIL_PREVIEW_TEMPLATES) {
      for (const variant of definition.variants) {
        for (const locale of SUPPORTED_LOCALES) {
          const preview = renderEmailPreview({ template: definition.id, variant, locale });
          expect(preview.subject).not.toBe("");
          expect(preview.html).toContain(`<html lang="${locale}">`);
        }
      }
    }
  });

  it("rejects an unsupported variant with corrective guidance", () => {
    expect(() => renderEmailPreview({ template: "bioblitz-winner", variant: "fastest", locale: "en" })).toThrow(
      'Unknown variant "fastest" for bioblitz-winner. Choose one of: most-observations, best-picture.',
    );
  });
});
