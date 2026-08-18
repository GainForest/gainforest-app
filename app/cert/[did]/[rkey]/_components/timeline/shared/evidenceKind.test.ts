import { describe, expect, it } from "vitest";
import {
  getTimelineEvidenceKind,
  matchesTimelineFilter,
} from "./evidenceKind";

function uriContent(uri: string) {
  return { $type: "org.hypercerts.defs#uri", uri };
}

function blobContent(uri: string, mimeType = "application/pdf") {
  return {
    $type: "org.hypercerts.defs#smallBlob",
    blob: { $type: "blob", uri, mimeType, size: 100, name: "file.pdf" },
  };
}

describe("timeline evidence kind", () => {
  it("classifies trees, sounds, nature, and files from content type", () => {
    expect(getTimelineEvidenceKind("tree-dataset", [])).toBe("tree");
    expect(getTimelineEvidenceKind("audio", [])).toBe("audio");
    expect(getTimelineEvidenceKind("biodiversity", [])).toBe("nature");
    expect(getTimelineEvidenceKind("document", [])).toBe("file");
    expect(getTimelineEvidenceKind("update", [])).toBe("update");
  });

  it("classifies linked records and files when content type is missing", () => {
    expect(getTimelineEvidenceKind(null, [uriContent("at://did:example:org/app.gainforest.dwc.dataset/trees")])).toBe("tree");
    expect(getTimelineEvidenceKind(null, [uriContent("at://did:example:org/app.gainforest.ac.audio/sound")])).toBe("audio");
    expect(getTimelineEvidenceKind(null, [uriContent("at://did:example:org/app.gainforest.dwc.occurrence/nature")])).toBe("nature");
    expect(getTimelineEvidenceKind(null, [blobContent("https://example.org/report.pdf")])).toBe("file");
  });

  it("keeps project places and unresolved entries in the files filter", () => {
    expect(matchesTimelineFilter("site", "file")).toBe(true);
    expect(matchesTimelineFilter("other", "file")).toBe(true);
    expect(matchesTimelineFilter("tree", "file")).toBe(false);
    expect(matchesTimelineFilter("audio", "audio")).toBe(true);
  });

  it("shows text updates under the all filter only", () => {
    expect(matchesTimelineFilter("update", "all")).toBe(true);
    expect(matchesTimelineFilter("update", "file")).toBe(false);
    expect(matchesTimelineFilter("update", "tree")).toBe(false);
  });
});
