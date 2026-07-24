import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return extname(entry.name) === ".tsx" ? [path] : [];
  });
}

const fieldToolDirectories = [
  "app/audiomoth",
  "app/labeler",
  "app/submit-data",
  "app/taina",
  "app/bioblitz",
];

describe("field-tools UI contract", () => {
  it("does not render decorative supertitles or invalid serif typography", () => {
    for (const path of fieldToolDirectories.flatMap(sourceFiles)) {
      const source = read(path);
      expect(source, path).not.toMatch(/\beyebrow=|hero\.kicker|programLabel|font-serif/);

      for (const line of source.split("\n")) {
        if (/<(?:h[1-6]|DialogTitle)\b/.test(line)) {
          expect(line, `${path}: every semantic heading must use Instrument`).toContain("font-instrument");
          expect(line, `${path}: Instrument headings must be italic`).toContain("italic");
        }
        if (line.includes("font-instrument")) {
          expect(line, `${path}: Instrument is reserved for semantic headings`).toMatch(/<(?:h[1-6]|DialogTitle)\b/);
        }
      }
    }
  });

  it("keeps rounded, visibly contrasting hierarchy without faint grouping surfaces", () => {
    for (const path of fieldToolDirectories.flatMap(sourceFiles)) {
      expect(read(path), path).not.toMatch(/bg-muted\/(?:20|30|40)|bg-foreground\/5/);
    }

    expect(read("app/bioblitz/BioblitzClient.tsx")).toContain(
      'rounded-2xl bg-muted p-4 sm:p-5 ${className ?? ""}',
    );
    expect(read("app/bioblitz/_components/BioblitzLegalDocument.tsx")).toContain(
      "mt-8 rounded-3xl bg-muted p-4 sm:p-5 md:p-8",
    );
  });

  it("keeps data-job archive bytes in direct storage PUTs and owner cancel uploading-only", () => {
    const source = read("app/submit-data/_components/SubmitDataClient.tsx");
    expect(source).toContain('xhr.open("PUT", url)');
    expect(source).toContain('job.status === "uploading"');
    expect(source).not.toMatch(/body:\s*(?:blob|file)/);
  });

  it("keeps Tainá ownership session-derived and runtime errors localized", () => {
    const source = read("app/taina/_components/TainaSetupClient.tsx");
    expect(source).toContain("JSON.stringify({ botToken: token, focus: focus.trim() })");
    expect(source).not.toMatch(/JSON\.stringify\(\{[^}]*\bdid\b/);
    expect(source).toContain('ERROR_KEYS[code] ?? "genericError"');
    expect(source).not.toContain(": code ||");
  });

  it("retains gates and reduced-motion fallbacks", () => {
    expect(read("app/audiomoth/page.tsx")).toContain("Boolean(moderator?.isModerator)");
    expect(read("app/audiomoth/_components/AudioMothClient.tsx")).toContain("useReducedMotion()");
    expect(read("app/bioblitz/BioblitzAwardControls.tsx")).toContain("if (!roundState) return null");
    const gallery = read("app/bioblitz/BioblitzGallery.tsx");
    expect(gallery).toContain('view === "all" || shouldReduceMotion');
    expect(gallery).toContain('const staticRecords = view === "all" ? records : wallRecords');
    expect(gallery).toContain("motion-reduce:animate-none");
    expect(read("app/bioblitz/BioblitzBestPicture.tsx")).toContain("motion-reduce:animate-none");
  });

  it("handles deep-link failure and discloses BioBlitz publishing before registration", () => {
    expect(read("app/labeler/_components/LabelerClient.tsx")).toContain(
      "Keep the loaded queue usable when a deep-linked record is unavailable.",
    );
    expect(read("app/bioblitz/BioblitzRegister.tsx")).toContain('t("publicPostDisclosure")');
  });
});
