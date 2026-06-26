import { describe, expect, it } from "vitest";
import {
  getTimelineOptionalNoteBlocks,
  hasTimelineOptionalNote,
} from "./optionalNoteModel";

describe("timeline optional note", () => {
  it("keeps plain notes working", () => {
    expect(getTimelineOptionalNoteBlocks({
      $type: "org.hypercerts.defs#descriptionString",
      value: "  Field visit notes  ",
    })).toEqual([
      { type: "paragraph", spans: [{ text: "Field visit notes" }] },
    ]);
  });

  it("renders indexed links without exposing unsafe links", () => {
    const blocks = getTimelineOptionalNoteBlocks({
      $type: "org.hypercerts.defs#descriptionString",
      value: "Read report and internal ref",
      facets: [
        {
          index: { byteStart: 5, byteEnd: 11 },
          features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.org/report" }],
        },
        {
          index: { byteStart: 16, byteEnd: 28 },
          features: [{ $type: "app.bsky.richtext.facet#link", uri: "at://did:example:org/collection/rkey" }],
        },
      ],
    });

    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    expect(blocks[0]?.type === "paragraph" ? blocks[0].spans : []).toEqual([
      { text: "Read " },
      { text: "report", href: "https://example.org/report" },
      { text: " and " },
      { text: "internal ref" },
    ]);
  });

  it("renders Leaflet-style document notes", () => {
    const blocks = getTimelineOptionalNoteBlocks({
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [
        {
          alignment: "center",
          block: {
            $type: "pub.leaflet.blocks.header",
            plaintext: "Site visit",
            level: 2,
          },
        },
        {
          block: {
            $type: "pub.leaflet.blocks.text",
            plaintext: "Trees looked healthy.",
          },
        },
        {
          block: {
            $type: "pub.leaflet.blocks.website",
            src: "https://example.org/photos",
            title: "Photos",
          },
        },
      ],
    });

    expect(blocks).toEqual([
      { type: "heading", level: 2, spans: [{ text: "Site visit" }], align: "center" },
      { type: "paragraph", spans: [{ text: "Trees looked healthy." }], align: null },
      { type: "link", href: "https://example.org/photos", title: "Photos", description: null },
    ]);
    expect(hasTimelineOptionalNote({ $type: "pub.leaflet.pages.linearDocument", blocks: [] })).toBe(false);
  });
});
