import { describe, expect, it } from "vitest";
import {
  classifyAttachmentPreview,
  contentHasFileLikeItem,
  contentHasRecordCollection,
  getFilePickerEvidenceContentTypeOptions,
  getRegisteredEvidenceKind,
} from "./evidenceContentTypeRegistry";

function uriContent(uri: string) {
  return { $type: "org.hypercerts.defs#uri", uri };
}

describe("evidence content type registry", () => {
  it("classifies registered timeline evidence types", () => {
    expect(getRegisteredEvidenceKind("tree-dataset")).toBe("tree");
    expect(getRegisteredEvidenceKind("audio")).toBe("audio");
    expect(getRegisteredEvidenceKind("biodiversity-dataset")).toBe("nature");
    expect(getRegisteredEvidenceKind("document")).toBe("file");
    expect(getRegisteredEvidenceKind("location")).toBe("site");
  });

  it("returns source-truth file picker options", () => {
    expect(getFilePickerEvidenceContentTypeOptions().map((option) => option.value)).toEqual([
      "document",
      "report",
      "audit",
      "evidence",
      "testimonial",
      "methodology",
      "photo",
      "video",
      "dataset",
      "certificate",
      "audio",
      "other",
    ]);
  });

  it("classifies file previews by mime type and extension", () => {
    expect(classifyAttachmentPreview("application/pdf", null)).toEqual({ kind: "pdf", documentFormat: "pdf" });
    expect(classifyAttachmentPreview("application/octet-stream", "docx")).toEqual({ kind: "document", documentFormat: "word" });
    expect(classifyAttachmentPreview("text/csv", null)).toEqual({ kind: "document", documentFormat: "spreadsheet" });
    expect(classifyAttachmentPreview(null, "mp3")).toEqual({ kind: "audio", documentFormat: null });
    expect(classifyAttachmentPreview(null, "unknown")).toEqual({ kind: "link", documentFormat: null });
  });

  it("finds file-like content and linked records", () => {
    const content = [
      uriContent("at://did:example:org/app.gainforest.dwc.occurrence/nature"),
      uriContent("https://example.org/report.pdf"),
    ];

    expect(contentHasRecordCollection(content, "app.gainforest.dwc.occurrence")).toBe(true);
    expect(contentHasFileLikeItem(content)).toBe(true);
  });
});
