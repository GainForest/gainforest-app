import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const docsRoot = path.join(process.cwd(), "app", "docs");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const sources = sourceFiles(docsRoot).map((file) => ({
  file: path.relative(process.cwd(), file),
  source: readFileSync(file, "utf8"),
}));

describe("documentation UI contract", () => {
  it("does not use the generic Garamond escape path", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/font-serif|font-garamond|--font-garamond-var/);
    }
  });

  it("does not render decorative kicker or wallet part-label keys", () => {
    const forbiddenCalls = [
      /t\(["']kicker["']\)/,
      /t\(["']hero\.kicker["']\)/,
      /t\(["']part[1-4]\.label["']\)/,
    ];

    for (const { file, source } of sources) {
      for (const pattern of forbiddenCalls) {
        expect(source, `${file}: ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("guards continuous and travelling diagram motion for reduced-motion users", () => {
    const requestJourney = readFileSync(
      path.join(docsRoot, "cgs", "_components", "RequestJourney.tsx"),
      "utf8",
    );
    const loginJourney = readFileSync(
      path.join(docsRoot, "ePDS", "_components", "LoginJourney.tsx"),
      "utf8",
    );
    const compareLogin = readFileSync(
      path.join(docsRoot, "ePDS", "_components", "CompareLogin.tsx"),
      "utf8",
    );
    const syncJourney = readFileSync(
      path.join(docsRoot, "ePDS-router", "_components", "SyncJourney.tsx"),
      "utf8",
    );
    const lookupDemo = readFileSync(
      path.join(docsRoot, "ePDS-router", "_components", "RouterLookupDemo.tsx"),
      "utf8",
    );
    const firehose = readFileSync(
      path.join(docsRoot, "atproto", "_components", "Firehose.tsx"),
      "utf8",
    );
    const audioMoth = readFileSync(
      path.join(docsRoot, "audiomoth", "_components", "AudioMothGuide.tsx"),
      "utf8",
    );

    for (const source of [requestJourney, loginJourney]) {
      expect(source).toContain("useReducedMotion()");
      expect(source).toContain("!shouldReduceMotion && <animate");
    }
    for (const source of [syncJourney, lookupDemo, firehose]) {
      expect(source).toContain("useReducedMotion()");
      expect(source).toMatch(/duration: shouldReduceMotion \? 0 :/);
    }
    expect(compareLogin).toContain("useReducedMotion()");
    expect(compareLogin).toContain("if (shouldReduceMotion)");
    expect(compareLogin).toContain("setTyped(CODE.length)");
    expect(audioMoth).toContain("useReducedMotion()");
    expect(audioMoth).toContain("shouldReduceMotion ? { duration: 0 } : { repeat: Infinity");
    expect(audioMoth).toContain('shouldReduceMotion ? { duration: 0 } : { type: "spring"');
  });
});
