import { parseArgs } from "node:util";
import { z } from "zod";

import { DEFAULT_LANGUAGE, isSupportedLanguageCode, SUPPORTED_LOCALES } from "@/lib/i18n/languages";
import {
  EMAIL_PREVIEW_TEMPLATES,
  renderEmailPreview,
  type EmailPreviewTemplateId,
  type RenderedEmailPreview,
} from "./registry";

export type TestEmailSendInput = {
  readonly apiKey: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
};

export type EmailPreviewCliDependencies = {
  readonly writePreview: (preview: RenderedEmailPreview, outputPath?: string) => Promise<string>;
  readonly openPreview: (path: string) => Promise<void>;
  readonly sendEmail: (input: TestEmailSendInput) => Promise<{ readonly id: string | null }>;
};

export class EmailPreviewUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailPreviewUsageError";
  }
}

function usageError(message: string): never {
  throw new EmailPreviewUsageError(message);
}

const HELP = `Usage:
  pnpm email:preview <template> [--variant <name>] [--locale <code>]
  pnpm email:preview <template> --open
  pnpm email:preview <template> --send --to <email>
  pnpm email:preview --list

Preview is the default; nothing is sent unless --send is present.

Options:
  --variant <name>  Choose fixture content for the template
  --locale <code>   Choose en, es, pt, sw, or id (default: en)
  --output <path>   Write preview HTML to this path
  --open            Open the generated HTML preview
  --send            Deliver through Resend instead of writing a file
  --to <email>      Required recipient for --send
  --list            List templates and fixture variants
  --help            Show this help`;

function templateList(): string {
  return EMAIL_PREVIEW_TEMPLATES.map((definition) => {
    const variants = definition.variants.map((variant) => variant === definition.defaultVariant ? `${variant} (default)` : variant);
    return `${definition.id}: ${variants.join(", ")}`;
  }).join("\n");
}

type EmailPreviewEnvironment = Readonly<Record<string, string | undefined>>;

function isProduction(environment: EmailPreviewEnvironment): boolean {
  return environment.NODE_ENV === "production"
    || environment.VERCEL_ENV === "production"
    || environment.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production";
}

function parse(arguments_: string[]) {
  try {
    return parseArgs({
      args: arguments_,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean" },
        list: { type: "boolean" },
        locale: { type: "string" },
        open: { type: "boolean" },
        output: { type: "string" },
        send: { type: "boolean" },
        to: { type: "string" },
        variant: { type: "string" },
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The command arguments could not be parsed.";
    return usageError(`${detail} Run pnpm email:preview --help for usage.`);
  }
}

export async function runEmailPreviewCli(
  arguments_: string[],
  environment: EmailPreviewEnvironment,
  dependencies: EmailPreviewCliDependencies,
): Promise<string> {
  const { positionals, values } = parse(arguments_);
  if (values.help || (positionals.length === 0 && !values.list)) return HELP;
  if (values.list) {
    if (positionals.length > 0) usageError("--list does not accept a template. Run pnpm email:preview --list by itself.");
    return templateList();
  }
  if (positionals.length !== 1) {
    usageError(`Expected one email template, but received: ${positionals.join(", ")}.`);
  }

  const requestedTemplate = positionals[0];
  const definition = EMAIL_PREVIEW_TEMPLATES.find((item) => item.id === requestedTemplate);
  if (!definition) {
    usageError(`Unknown email template "${requestedTemplate}". Run pnpm email:preview --list to see available templates.`);
  }
  const requestedLocale = values.locale ?? DEFAULT_LANGUAGE;
  if (!isSupportedLanguageCode(requestedLocale)) {
    usageError(`Unsupported locale "${values.locale}". Choose one of: ${SUPPORTED_LOCALES.join(", ")}.`);
  }

  const template = definition.id as EmailPreviewTemplateId;
  const locale = requestedLocale;
  let preview: RenderedEmailPreview;
  try {
    preview = renderEmailPreview({ template, variant: values.variant, locale });
  } catch (error) {
    usageError(error instanceof Error ? error.message : "The selected email fixture could not be rendered.");
  }

  if (values.send) {
    if (values.open) usageError("--open cannot be combined with --send. Choose either local preview or test delivery.");
    if (values.output) usageError("--output cannot be combined with --send. Choose either local preview or test delivery.");
    if (!values.to) usageError("--send requires --to <email>. Add the test recipient and rerun the command.");
    if (!z.email().safeParse(values.to).success) {
      usageError(`Invalid recipient "${values.to}". Use a complete email address, for example developer@example.com.`);
    }
    if (isProduction(environment)) {
      usageError("Test email delivery is disabled in production. Run this command from a local development shell.");
    }
    const emailDisabled = environment.EMAIL_DISABLED?.trim() || "false";
    if (emailDisabled !== "true" && emailDisabled !== "false") {
      usageError("EMAIL_DISABLED must be exactly true or false. Fix it in .env.local or your shell, then rerun the command.");
    }
    if (emailDisabled === "true") {
      usageError("Test email delivery is disabled because EMAIL_DISABLED=true. Set it to false only when you intend to send a test email.");
    }
    const apiKey = environment.RESEND_API_KEY?.trim();
    if (!apiKey) {
      usageError("RESEND_API_KEY is missing. Set it in .env.local or your shell, then rerun the command.");
    }

    const result = await dependencies.sendEmail({
      apiKey,
      to: values.to,
      subject: preview.subject,
      html: preview.html,
      text: preview.text,
    });
    return `Sent ${template} (${preview.variant}, ${locale}) to ${values.to}. Resend id: ${result.id ?? "not returned"}`;
  }

  if (values.to) {
    usageError("--to only selects a recipient; add --send to deliver the test email. Without --send, omit --to.");
  }

  const path = await dependencies.writePreview(preview, values.output);
  if (values.open) await dependencies.openPreview(path);
  return `Wrote ${template} (${preview.variant}, ${locale}) to ${path}${values.open ? " and opened it" : ""}.`;
}
