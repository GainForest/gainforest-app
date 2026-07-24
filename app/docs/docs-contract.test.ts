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

  it("uses italic Instrument for every semantic documentation heading", () => {
    const headings = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/<h([1-6])\b([^>]*)>/gs)].map((match) => ({
        file,
        level: match[1],
        classes: match[2]?.match(/className="([^"]*)"/)?.[1] ?? "",
      })),
    );

    expect(headings).toHaveLength(34);
    for (const heading of headings) {
      expect(heading.classes, `${heading.file}: h${heading.level}`).toContain("font-instrument");
      expect(heading.classes, `${heading.file}: h${heading.level}`).toContain("italic");
    }
  });

  it("keeps grouped surfaces rounded and visibly filled by default", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/bg-muted\/(?:15|20|25|30|40)|hover:bg-muted\/40/);
      expect(source, file).not.toMatch(/bg-primary\/5|bg-primary\/\[0\.0(?:3|4|5|6)\]/);
      expect(source, file).not.toMatch(/className="[^"]*\bborder-y\b/);
    }

    const audioMoth = readFileSync(
      path.join(docsRoot, "audiomoth", "_components", "AudioMothGuide.tsx"),
      "utf8",
    );
    expect(audioMoth).toContain("overflow-hidden rounded-2xl border border-border/60 bg-muted");
    expect(audioMoth).toContain("overflow-hidden rounded-2xl bg-muted");
    expect(audioMoth).toContain("rounded-xl bg-muted p-1");

    const compareLogin = readFileSync(
      path.join(docsRoot, "ePDS", "_components", "CompareLogin.tsx"),
      "utf8",
    );
    expect(compareLogin).toContain("rounded-2xl bg-muted p-6");

    const lexiconPage = readFileSync(
      path.join(docsRoot, "lexicons", "[nsid]", "page.tsx"),
      "utf8",
    );
    expect(lexiconPage).toContain("rounded-xl border-l-2 border-primary/30 bg-muted");
    expect(lexiconPage).toContain("rounded-xl bg-muted p-3");
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

  it("preserves technical code, table, and schema-diagram boundaries", () => {
    const markdown = readFileSync(
      path.join(docsRoot, "lexicons", "_components", "MarkdownDocument.tsx"),
      "utf8",
    );
    const defBlock = readFileSync(
      path.join(docsRoot, "lexicons", "_components", "DefBlock.tsx"),
      "utf8",
    );
    const registryPage = readFileSync(path.join(docsRoot, "lexicons", "page.tsx"), "utf8");

    expect(markdown).toContain("<pre");
    expect(markdown).toContain("<table");
    expect(markdown).toContain("overflow-x-auto rounded-xl border");
    expect(defBlock).toContain("<FieldTable");
    expect(defBlock).toContain("font-mono not-italic");
    expect(registryPage).toContain("<SchemaGraph");
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
