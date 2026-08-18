import { describe, expect, it } from "vitest";
import {
  getTimelineDocumentDefaultExtension,
  getTimelineDocumentFallbackMimeType,
  getTimelineDocumentFormat,
  getTimelineDocumentFormatExtensions,
  isTimelineDocumentFormat,
} from "./timelineDocumentFormats";

describe("timeline document formats", () => {
  it("detects common document formats from mime types and extensions", () => {
    expect(getTimelineDocumentFormat("application/pdf", null)).toBe("pdf");
    expect(getTimelineDocumentFormat("text/markdown; charset=utf-8", null)).toBe("markdown");
    expect(getTimelineDocumentFormat("application/octet-stream", "xlsx")).toBe("spreadsheet");
    expect(getTimelineDocumentFormat(null, "pptx")).toBe("presentation");
    expect(getTimelineDocumentFormat("application/unknown", "bin")).toBeNull();
  });

  it("exposes fallback mime types and safe extensions", () => {
    expect(getTimelineDocumentFallbackMimeType("pdf")).toBe("application/pdf");
    expect(getTimelineDocumentDefaultExtension("word")).toBe("docx");
    expect(getTimelineDocumentFormatExtensions("spreadsheet")).toContain("csv");
    expect(isTimelineDocumentFormat("html")).toBe(true);
    expect(isTimelineDocumentFormat("zip")).toBe(false);
  });
});
