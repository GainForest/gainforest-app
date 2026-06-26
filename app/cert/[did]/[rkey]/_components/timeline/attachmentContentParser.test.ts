import { describe, expect, it } from "vitest";
import {
  getAtUrisFromContent,
  getRenderableAttachmentLinksFromContent,
  parseAttachmentContent,
} from "./attachmentContentParser";

describe("attachment content parser", () => {
  it("normalizes uri, strong ref, text, and blob content", () => {
    const parsed = parseAttachmentContent([
      { $type: "org.hypercerts.defs#uri", uri: "https://example.org/report.pdf" },
      { $type: "com.atproto.repo.strongRef", uri: "at://did:example:org/app.gainforest.dwc.dataset/trees", cid: "bafytrees" },
      "Plain field note",
      {
        $type: "org.hypercerts.defs#smallBlob",
        blob: {
          $type: "blob",
          uri: "https://example.org/file.csv",
          cid: "bafyfile",
          mimeType: "text/csv",
          size: 42,
          name: "file.csv",
        },
      },
    ]);

    expect(parsed).toMatchObject([
      { kind: "uri", sourceType: "uri-definition", uriKind: "http-url" },
      { kind: "uri", sourceType: "strong-ref", uriKind: "at-uri", cid: "bafytrees" },
      { kind: "text", text: "Plain field note" },
      { kind: "blob", sourceType: "small-blob-definition", uriKind: "http-url", mimeType: "text/csv" },
    ]);
  });

  it("dedupes renderable links and keeps record links separate", () => {
    const content = [
      { $type: "org.hypercerts.defs#uri", uri: "https://example.org/report.pdf" },
      { $type: "org.hypercerts.defs#uri", uri: "https://example.org/report.pdf" },
      { uri: "at://did:example:org/app.gainforest.ac.audio/sound", cid: "bafysound" },
      { file: { uri: "https://example.org/photo.jpg", mimeType: "image/jpeg", size: 100 } },
    ];

    expect(getRenderableAttachmentLinksFromContent(content).map((link) => link.href)).toEqual([
      "https://example.org/report.pdf",
      "https://example.org/photo.jpg",
    ]);
    expect(getAtUrisFromContent(content)).toEqual([
      "at://did:example:org/app.gainforest.ac.audio/sound",
    ]);
  });
});
