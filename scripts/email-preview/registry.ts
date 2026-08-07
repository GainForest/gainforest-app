import { renderBioblitzWinnerEmail } from "@/lib/email/bioblitz-winner-template";
import { renderGroupInvitationEmailTemplate } from "@/lib/email/group-invitation-template";
import { renderOtpEmailTemplate } from "@/lib/email/otp-template";
import { renderWelcomeEmailTemplate } from "@/lib/email/welcome-template";
import type { SupportedLanguageCode } from "@/lib/i18n/languages";

export const EMAIL_PREVIEW_TEMPLATES = [
  { id: "welcome", defaultVariant: "signup", variants: ["signup", "membership"] },
  { id: "organization-invitation", defaultVariant: "member", variants: ["member", "admin"] },
  { id: "bioblitz-winner", defaultVariant: "most-observations", variants: ["most-observations", "best-picture"] },
  { id: "otp", defaultVariant: "returning-user", variants: ["returning-user", "new-user"] },
] as const;

export type EmailPreviewTemplateId = (typeof EMAIL_PREVIEW_TEMPLATES)[number]["id"];

export type RenderedEmailPreview = {
  readonly template: EmailPreviewTemplateId;
  readonly variant: string;
  readonly locale: SupportedLanguageCode;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
};

export function renderEmailPreview({
  template,
  variant,
  locale,
}: {
  template: EmailPreviewTemplateId;
  variant?: string;
  locale: SupportedLanguageCode;
}): RenderedEmailPreview {
  const definition = EMAIL_PREVIEW_TEMPLATES.find((item) => item.id === template)!;
  const selectedVariant = variant ?? definition.defaultVariant;
  if (!(definition.variants as readonly string[]).includes(selectedVariant)) {
    throw new Error(`Unknown variant "${selectedVariant}" for ${template}. Choose one of: ${definition.variants.join(", ")}.`);
  }

  if (template === "welcome") {
    return {
      template,
      variant: selectedVariant,
      locale,
      ...renderWelcomeEmailTemplate({
        variant: selectedVariant === "membership" ? "organization-invite" : "direct-signup",
        locale,
        name: "Forest Steward",
        organizationName: selectedVariant === "membership" ? "Forest Circle" : null,
        invitedByName: undefined,
        invitedByEmail: undefined,
        siteUrl: "https://www.gainforest.app",
      }),
    };
  }

  if (template === "organization-invitation") {
    return {
      template,
      variant: selectedVariant,
      locale,
      ...renderGroupInvitationEmailTemplate({
        locale,
        invitedEmail: "preview@example.com",
        organizationName: "Forest Circle",
        inviterName: "Forest Owner",
        inviterUrl: "https://www.gainforest.app/account/preview",
        role: selectedVariant as "member" | "admin",
        acceptUrl: "https://example.com/gainforest-preview/invitation",
        siteUrl: "https://www.gainforest.app",
      }),
    };
  }

  if (template === "bioblitz-winner") {
    return {
      template,
      variant: selectedVariant,
      locale,
      ...renderBioblitzWinnerEmail({
        locale,
        roundLabel: "BioBlitz Week 4",
        prize: selectedVariant as "most-observations" | "best-picture",
        siteUrl: "https://www.gainforest.app",
      }),
    };
  }

  const isNewUser = selectedVariant === "new-user";
  const html = renderOtpEmailTemplate(locale)
    .replace(/{{#is_new_user}}([\s\S]*?){{\/is_new_user}}/g, isNewUser ? "$1" : "")
    .replace(/{{\^is_new_user}}([\s\S]*?){{\/is_new_user}}/g, isNewUser ? "" : "$1")
    .replaceAll("{{app_name}}", "GainForest")
    .replaceAll("{{logo_uri}}", "https://www.gainforest.app/icons/icon-192.png")
    .replaceAll("{{code}}", "482913");
  const subject = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  if (!subject) throw new Error("The OTP preview has no HTML title to use as its test-email subject.");

  return { template, variant: selectedVariant, locale, subject, html };
}
