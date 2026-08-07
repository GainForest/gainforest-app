import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { sendResendEmail } from "@/lib/email/resend";
import { EmailPreviewUsageError, runEmailPreviewCli, type EmailPreviewCliDependencies } from "./email-preview/cli";

async function writePreview(
  preview: Parameters<EmailPreviewCliDependencies["writePreview"]>[0],
  requestedPath?: string,
): Promise<string> {
  const path = requestedPath
    ? resolve(requestedPath)
    : join(
      await mkdtemp(join(tmpdir(), "gainforest-email-preview-")),
      `${preview.template}-${preview.variant}-${preview.locale}.html`,
    );
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, preview.html, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new EmailPreviewUsageError(`Preview output already exists at ${path}. Choose another --output path or remove that generated file.`);
    }
    throw error;
  }
  return path;
}

async function openPreview(path: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const arguments_ = process.platform === "win32" ? ["/c", "start", "", path] : [path];
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, arguments_, { detached: true, stdio: "ignore" });
    child.once("error", () => reject(new Error(`The preview was written to ${path}, but no browser opener was available. Open the file manually.`)));
    child.once("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}

const dependencies: EmailPreviewCliDependencies = {
  writePreview,
  openPreview,
  sendEmail: input => sendResendEmail(input),
};

const commandArguments = process.argv.slice(2);
try {
  const output = await runEmailPreviewCli(commandArguments, process.env, dependencies);
  console.log(output);
} catch (error) {
  const message = error instanceof Error ? error.message : "The email preview command failed unexpectedly.";
  const deliveryMayBeUncertain = commandArguments.includes("--send") && !(error instanceof EmailPreviewUsageError);
  if (deliveryMayBeUncertain) {
    console.error(`Email preview delivery failed: ${message}\nDelivery may be uncertain. Check Resend before retrying.`);
  } else {
    console.error(`Email preview failed: ${message}\nNo email was sent.`);
  }
  process.exitCode = 1;
}
