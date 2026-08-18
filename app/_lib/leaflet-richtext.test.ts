import { describe, expect, it } from "vitest";
import {
  editorHtmlFromLeafletDocument,
  inlineSegmentsFromPlaintext,
  leafletDocumentFromPlainText,
  leafletDocumentHasText,
  leafletDocumentPlaintext,
  mergeInlineSegments,
  plaintextWithFacetsFromSegments,
  trimInlineSegments,
  type LeafletLinearDocument,
  type RichInlineSegment,
} from "./leaflet-richtext";

describe("inline segment handling", () => {
  it("merges adjacent segments with identical marks", () => {
    const merged = mergeInlineSegments([
      { text: "Hel", marks: { bold: true } },
      { text: "lo ", marks: { bold: true } },
      { text: "world", marks: {} },
      { text: "", marks: { italic: true } },
    ]);
    expect(merged).toEqual([
      { text: "Hello ", marks: { bold: true } },
      { text: "world", marks: {} },
    ]);
  });

  it("trims whitespace-only edges without touching inner spacing", () => {
    const trimmed = trimInlineSegments([
      { text: "  ", marks: {} },
      { text: " Planting ", marks: { bold: true } },
      { text: "day ", marks: {} },
      { text: "\n", marks: {} },
    ]);
    expect(trimmed).toEqual([
      { text: "Planting ", marks: { bold: true } },
      { text: "day", marks: {} },
    ]);
  });
});

describe("facet byte offsets", () => {
  it("computes UTF-8 byte ranges, not character indices", () => {
    // "Árvores" starts with a two-byte character.
    const segments: RichInlineSegment[] = [
      { text: "Árvores ", marks: {} },
      { text: "plantadas", marks: { bold: true } },
    ];
    const { plaintext, facets } = plaintextWithFacetsFromSegments(segments);
    expect(plaintext).toBe("Árvores plantadas");
    expect(facets).toEqual([
      {
        index: { byteStart: 9, byteEnd: 18 },
        features: [{ $type: "pub.leaflet.richtext.facet#bold" }],
      },
    ]);
  });

  it("stacks every mark of a run into one facet", () => {
    const { facets } = plaintextWithFacetsFromSegments([
      { text: "read this", marks: { bold: true, italic: true, link: "https://example.org/" } },
    ]);
    expect(facets).toEqual([
      {
        index: { byteStart: 0, byteEnd: 9 },
        features: [
          { $type: "pub.leaflet.richtext.facet#bold" },
          { $type: "pub.leaflet.richtext.facet#italic" },
          { $type: "pub.leaflet.richtext.facet#link", uri: "https://example.org/" },
        ],
      },
    ]);
  });

  it("round-trips plaintext + facets back into marked segments", () => {
    const original: RichInlineSegment[] = [
      { text: "Wir haben ", marks: {} },
      { text: "50 Bäume", marks: { bold: true } },
      { text: " gepflanzt — ", marks: {} },
      { text: "Bericht", marks: { link: "https://example.org/report" } },
    ];
    const { plaintext, facets } = plaintextWithFacetsFromSegments(original);
    expect(inlineSegmentsFromPlaintext(plaintext, facets)).toEqual(original);
  });
});

describe("document helpers", () => {
  const richDocument: LeafletLinearDocument = {
    $type: "pub.leaflet.pages.linearDocument",
    blocks: [
      {
        $type: "pub.leaflet.pages.linearDocument#block",
        block: { $type: "pub.leaflet.blocks.header", level: 2, plaintext: "Site visit" },
      },
      {
        $type: "pub.leaflet.pages.linearDocument#block",
        block: {
          $type: "pub.leaflet.blocks.text",
          plaintext: "Trees looked healthy.",
          facets: [
            {
              index: { byteStart: 0, byteEnd: 5 },
              features: [{ $type: "pub.leaflet.richtext.facet#bold" }],
            },
          ],
        },
      },
      {
        $type: "pub.leaflet.pages.linearDocument#block",
        block: {
          $type: "pub.leaflet.blocks.unorderedList",
          children: [
            { content: { $type: "pub.leaflet.blocks.text", plaintext: "Planted 20 saplings" } },
            {
              content: { $type: "pub.leaflet.blocks.text", plaintext: "Watered the nursery" },
              children: [
                { content: { $type: "pub.leaflet.blocks.text", plaintext: "Twice" } },
              ],
            },
          ],
        },
      },
    ],
  };

  it("extracts plaintext across headers, text, and nested list items", () => {
    expect(leafletDocumentPlaintext(richDocument)).toBe(
      "Site visit\nTrees looked healthy.\nPlanted 20 saplings\nWatered the nursery\nTwice",
    );
  });

  it("treats documents with no text as empty", () => {
    expect(leafletDocumentHasText(null)).toBe(false);
    expect(leafletDocumentHasText(undefined)).toBe(false);
    expect(
      leafletDocumentHasText({
        $type: "pub.leaflet.pages.linearDocument",
        blocks: [
          {
            $type: "pub.leaflet.pages.linearDocument#block",
            block: { $type: "pub.leaflet.blocks.text", plaintext: "   " },
          },
        ],
      }),
    ).toBe(false);
    expect(leafletDocumentHasText(richDocument)).toBe(true);
  });

  it("splits plain text into one text block per paragraph", () => {
    expect(leafletDocumentFromPlainText("First point.\n\nSecond point.")).toEqual({
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: { $type: "pub.leaflet.blocks.text", plaintext: "First point." },
        },
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: { $type: "pub.leaflet.blocks.text", plaintext: "Second point." },
        },
      ],
    });
  });

  it("renders editor HTML with marks, lists, and escaping", () => {
    expect(editorHtmlFromLeafletDocument(richDocument)).toBe(
      "<h2>Site visit</h2>" +
        "<p><strong>Trees</strong> looked healthy.</p>" +
        "<ul><li>Planted 20 saplings</li><li>Watered the nursery<ul><li>Twice</li></ul></li></ul>",
    );

    const hostile: LeafletLinearDocument = {
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [
        {
          $type: "pub.leaflet.pages.linearDocument#block",
          block: {
            $type: "pub.leaflet.blocks.text",
            plaintext: "<script>alert(1)</script>",
            facets: [
              {
                index: { byteStart: 0, byteEnd: 25 },
                features: [
                  { $type: "pub.leaflet.richtext.facet#link", uri: "javascript:alert(1)" as string },
                ],
              },
            ],
          },
        },
      ],
    };
    expect(editorHtmlFromLeafletDocument(hostile)).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });
});
