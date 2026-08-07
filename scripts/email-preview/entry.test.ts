import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function run(arguments_: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/email-preview.ts", ...arguments_], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
  });
}

describe("email preview entrypoint", () => {
  it("writes renderable HTML through the real command", () => {
    const directory = mkdtempSync(join(tmpdir(), "gainforest-email-preview-test-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "nested", "bioblitz.html");

    const result = run(["bioblitz-winner", "--variant", "best-picture", "--output", outputPath]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Wrote bioblitz-winner (best-picture, en) to ${outputPath}`);
    const html = readFileSync(outputPath, "utf8");
    expect(html).toContain("You’re a BioBlitz winner");
    expect(html).toContain("Best picture");
  });

  it("returns actionable errors with a failing exit status", () => {
    const result = run(["welcome", "--send"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--send requires --to <email>");
    expect(result.stderr).toContain("No email was sent.");
  });

  it("does not describe local preview failures as uncertain email delivery", () => {
    const directory = mkdtempSync(join(tmpdir(), "gainforest-email-preview-test-"));
    temporaryDirectories.push(directory);
    const blockingFile = join(directory, "not-a-directory");
    writeFileSync(blockingFile, "fixture");

    const result = run(["welcome", "--output", join(blockingFile, "preview.html")]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No email was sent.");
    expect(result.stderr).not.toContain("Delivery may be uncertain");
  });
});
