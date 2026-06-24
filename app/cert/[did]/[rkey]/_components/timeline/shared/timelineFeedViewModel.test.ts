import { describe, expect, it } from "vitest";
import { buildTimelineFeedTiles, type TimelineFeedCopy } from "./timelineFeedViewModel";
import type { TimelineReference } from "../timelineReferences";

const copy: TimelineFeedCopy = {
  linkedNatureDataGroup: "Linked nature data group",
  linkedNatureData: "Linked nature data",
  linkedFile: "Linked file",
  image: "Image",
  video: "Video",
  audio: "Sound",
  pdf: "PDF",
  document: "Document",
  linkedTreeInformation: "Linked tree information",
  linkedItem: "Linked evidence",
  linkedProjectPlace: "Linked project place",
  linkedTreeGroup: "Linked tree group",
  linkedSound: "Linked sound",
  groupedData: "Grouped data",
  unresolvedReferenceBody: "This linked evidence could not be loaded yet.",
};

function uriContent(uri: string) {
  return { $type: "org.hypercerts.defs#uri", uri };
}

function blobContent(uri: string, mimeType: string, name: string) {
  return {
    $type: "org.hypercerts.defs#smallBlob",
    blob: { $type: "blob", uri, mimeType, size: 100, name },
  };
}

describe("timeline feed view model", () => {
  it("builds previews for files and linked sounds", () => {
    const audioUri = "at://did:example:org/app.gainforest.ac.audio/sound-1";
    const references: TimelineReference[] = [
      {
        id: audioUri,
        kind: "audio",
        title: "Morning birds",
        description: "May 2026",
        actionHref: "https://example.org/birds.mp3",
      },
    ];

    const tiles = buildTimelineFeedTiles({
      entryId: "entry",
      content: [
        blobContent("https://example.org/report.pdf", "application/pdf", "report.pdf"),
        uriContent(audioUri),
      ],
      references,
      copy,
    });

    expect(tiles.map((tile) => [tile.kind, tile.title, tile.preview?.kind])).toEqual([
      ["pdf", "PDF", "pdf"],
      ["audio", "Morning birds", "audio"],
    ]);
    expect(tiles[0]?.caption).toBe("report.pdf");
  });

  it("uses plain fallback copy for unresolved references", () => {
    const tiles = buildTimelineFeedTiles({
      entryId: "entry",
      content: [uriContent("at://did:example:org/app.gainforest.dwc.occurrence/missing")],
      references: [],
      copy,
    });

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      kind: "nature",
      title: "Linked nature data",
      caption: "Linked nature data",
      preview: {
        kind: "text",
        title: "Linked nature data",
        body: "This linked evidence could not be loaded yet.",
      },
    });
    expect(JSON.stringify(tiles[0])).not.toContain("did:example");
  });
});
