import { describe, expect, it } from "vitest";
import { renderWelcomeEmailTemplate, resolveWelcomeEmailLocale } from "./welcome-template";

describe("resolveWelcomeEmailLocale", () => {
  it("uses the base locale for regional explicit locale values", () => {
    expect(resolveWelcomeEmailLocale({ explicitLocale: "es-MX" })).toBe("es");
    expect(resolveWelcomeEmailLocale({ explicitLocale: "pt-BR" })).toBe("pt");
  });
});

describe("renderWelcomeEmailTemplate", () => {
  it("does not display inviter email when no inviter name is provided", () => {
    const rendered = renderWelcomeEmailTemplate({
      variant: "organization-invite",
      locale: "en",
      organizationName: "Forest Community",
      invitedByEmail: "admin@example.com",
      communityFormUrl: "",
    });

    expect(rendered.html).toContain("An organization admin invited you to collaborate");
    expect(rendered.text).toContain("An organization admin invited you to collaborate");
    expect(rendered.html).not.toContain("admin@example.com");
    expect(rendered.text).not.toContain("admin@example.com");
  });

  it("uses inviter name when it is provided", () => {
    const rendered = renderWelcomeEmailTemplate({
      variant: "organization-invite",
      locale: "en",
      organizationName: "Forest Community",
      invitedByName: "Satyam",
      invitedByEmail: "satyam@example.com",
      communityFormUrl: "",
    });

    expect(rendered.html).toContain("Satyam invited you to join Forest Community on GainForest");
    expect(rendered.text).toContain("Satyam invited you to join Forest Community on GainForest");
    expect(rendered.html).not.toContain("satyam@example.com");
  });

  it("omits the greeting when no display name is provided", () => {
    const rendered = renderWelcomeEmailTemplate({
      variant: "organization-invite",
      locale: "es",
      communityFormUrl: "",
    });

    expect(rendered.html).toContain("Te uniste a tu organización en GainForest");
    expect(rendered.html).not.toContain("Hola amigo/a,");
    expect(rendered.html).not.toContain("Hi there");
    expect(rendered.html).not.toContain("your organization");
  });

  it("uses the provided display name in the localized greeting", () => {
    const rendered = renderWelcomeEmailTemplate({
      variant: "organization-invite",
      locale: "es",
      name: "María",
      communityFormUrl: "",
    });

    expect(rendered.html).toContain("Hola María,");
    expect(rendered.text).toContain("Hola María,");
  });

  it("renders centered hero copy and left-aligned action/list content", () => {
    const rendered = renderWelcomeEmailTemplate({
      variant: "direct-signup",
      locale: "en",
      communityFormUrl: "https://example.com/community",
    });

    expect(rendered.html).toContain("font-size: 20px");
    expect(rendered.html).toContain(">Welcome to</span>");
    expect(rendered.html).toContain(">GainForest</span>");
    expect(rendered.html).toContain("email-body\" style=\"padding: 40px 36px 24px; text-align: center");
    expect(rendered.html).toContain("<ul style=\"margin: 0 0 18px; padding-left: 18px; font-size: 13px; line-height: 1.55; text-align: left;");
  });
});
