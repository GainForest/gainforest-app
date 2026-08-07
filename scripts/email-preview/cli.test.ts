import { describe, expect, it } from "vitest";

import { renderEmailPreview, type RenderedEmailPreview } from "./registry";
import { runEmailPreviewCli, type EmailPreviewCliDependencies, type TestEmailSendInput } from "./cli";

type Calls = {
  written: Array<{ preview: RenderedEmailPreview; outputPath?: string }>;
  opened: string[];
  sent: TestEmailSendInput[];
};

function dependencies(calls: Calls): EmailPreviewCliDependencies {
  return {
    async writePreview(preview, outputPath) {
      calls.written.push({ preview, outputPath });
      return outputPath ?? "/tmp/gainforest-email-previews/preview.html";
    },
    async openPreview(path) {
      calls.opened.push(path);
    },
    async sendEmail(input) {
      calls.sent.push(input);
      return { id: "email-preview-1" };
    },
  };
}

function setup() {
  const calls: Calls = { written: [], opened: [], sent: [] };
  return { calls, dependencies: dependencies(calls) };
}

describe("email preview CLI", () => {
  it("shows concise help when no template is provided", async () => {
    const fixture = setup();
    const output = await runEmailPreviewCli([], {}, fixture.dependencies);

    expect(output).toContain("pnpm email:preview <template>");
    expect(output).toContain("Preview is the default; nothing is sent unless --send is present.");
    expect(fixture.calls).toEqual({ written: [], opened: [], sent: [] });
  });

  it("lists every template with its variants", async () => {
    const fixture = setup();
    const output = await runEmailPreviewCli(["--list"], {}, fixture.dependencies);

    expect(output).toContain("welcome: signup (default), membership");
    expect(output).toContain("bioblitz-winner: most-observations (default), best-picture");
    expect(output).toContain("otp: returning-user (default), new-user");
  });

  it("writes a safe HTML preview by default without sending", async () => {
    const fixture = setup();
    const output = await runEmailPreviewCli(
      ["bioblitz-winner", "--variant", "best-picture", "--locale", "pt"],
      {},
      fixture.dependencies,
    );

    expect(fixture.calls.written).toEqual([{
      preview: renderEmailPreview({ template: "bioblitz-winner", variant: "best-picture", locale: "pt" }),
      outputPath: undefined,
    }]);
    expect(fixture.calls.sent).toEqual([]);
    expect(output).toContain("Wrote bioblitz-winner (best-picture, pt)");
    expect(output).toContain("/tmp/gainforest-email-previews/preview.html");
  });

  it("opens only the generated local preview when --open is present", async () => {
    const fixture = setup();
    await runEmailPreviewCli(["welcome", "--open", "--output", "/tmp/welcome.html"], {}, fixture.dependencies);

    expect(fixture.calls.written[0]?.outputPath).toBe("/tmp/welcome.html");
    expect(fixture.calls.opened).toEqual(["/tmp/welcome.html"]);
    expect(fixture.calls.sent).toEqual([]);
  });

  it("sends the rendered production template only with explicit --send and --to", async () => {
    const fixture = setup();
    const output = await runEmailPreviewCli(
      ["bioblitz-winner", "--variant", "most-observations", "--locale", "en", "--send", "--to", "karma@gainforest.net"],
      { RESEND_API_KEY: "re_test_key" },
      fixture.dependencies,
    );
    const rendered = renderEmailPreview({ template: "bioblitz-winner", variant: "most-observations", locale: "en" });

    expect(fixture.calls.written).toEqual([]);
    expect(fixture.calls.sent).toEqual([{
      apiKey: "re_test_key",
      to: "karma@gainforest.net",
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }]);
    expect(output).toBe("Sent bioblitz-winner (most-observations, en) to karma@gainforest.net. Resend id: email-preview-1");
  });

  it.each([
    [["welcome", "--send"], { RESEND_API_KEY: "re_test_key" }, "--send requires --to <email>"],
    [["welcome", "--to", "karma@gainforest.net"], {}, "--to only selects a recipient; add --send to deliver the test email"],
    [["welcome", "--send", "--to", "not-an-email"], { RESEND_API_KEY: "re_test_key" }, 'Invalid recipient "not-an-email"'],
    [["welcome", "--send", "--to", "karma@gainforest.net"], {}, "RESEND_API_KEY is missing"],
    [["welcome", "--send", "--to", "karma@gainforest.net"], { RESEND_API_KEY: "re_test_key", EMAIL_DISABLED: "true" }, "Test email delivery is disabled because EMAIL_DISABLED=true"],
    [["welcome", "--send", "--to", "karma@gainforest.net"], { RESEND_API_KEY: "re_test_key", EMAIL_DISABLED: "sometimes" }, "EMAIL_DISABLED must be exactly true or false"],
    [["welcome", "--send", "--to", "karma@gainforest.net"], { RESEND_API_KEY: "re_test_key", NODE_ENV: "production" }, "Test email delivery is disabled in production"],
    [["welcome", "--send", "--to", "karma@gainforest.net"], { RESEND_API_KEY: "re_test_key", VERCEL_ENV: "production" }, "Test email delivery is disabled in production"],
  ] as const)("rejects unsafe delivery arguments: %j", async (args, environment, message) => {
    const fixture = setup();

    await expect(runEmailPreviewCli([...args], environment, fixture.dependencies)).rejects.toThrow(message);
    expect(fixture.calls.sent).toEqual([]);
  });

  it.each([
    [["unknown"], 'Unknown email template "unknown". Run pnpm email:preview --list to see available templates.'],
    [["welcome", "--locale", "fr"], 'Unsupported locale "fr". Choose one of: en, es, pt, sw, id.'],
    [["welcome", "--variant", "other"], 'Unknown variant "other" for welcome. Choose one of: signup, membership.'],
    [["welcome", "extra"], "Expected one email template, but received: welcome, extra."],
    [["welcome", "--send", "--to", "karma@gainforest.net", "--open"], "--open cannot be combined with --send"],
  ] as const)("explains invalid usage for %j", async (args, message) => {
    const fixture = setup();
    await expect(runEmailPreviewCli([...args], { RESEND_API_KEY: "re_test_key" }, fixture.dependencies)).rejects.toThrow(message);
  });
});
