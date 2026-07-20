import { describe, expect, it } from "vitest";

import {
  applyMention,
  buildMentionFacets,
  detectMentionQuery,
  mentionCandidatesFromFacets,
  mentionDidsOfFacets,
  segmentTextWithMentions,
  MENTION_FACET_TYPE,
} from "./mentions";

const JANE = { did: "did:plc:jane", name: "Jane Doe" };
const BOB = { did: "did:plc:bob", name: "Bob" };

describe("detectMentionQuery", () => {
  it("detects an @ token at the start of the text", () => {
    expect(detectMentionQuery("@jan", 4)).toEqual({ start: 0, query: "jan" });
  });

  it("detects an @ token after whitespace", () => {
    expect(detectMentionQuery("hello @jan", 10)).toEqual({ start: 6, query: "jan" });
  });

  it("allows one internal space (two-word names)", () => {
    expect(detectMentionQuery("hi @jane do", 11)).toEqual({ start: 3, query: "jane do" });
  });

  it("rejects a second space", () => {
    expect(detectMentionQuery("hi @jane doe x", 14)).toBeNull();
  });

  it("rejects an @ glued to a word (emails)", () => {
    expect(detectMentionQuery("mail me at me@example", 21)).toBeNull();
  });

  it("rejects tokens crossing a line break", () => {
    expect(detectMentionQuery("@ja\nne", 6)).toBeNull();
  });
});

describe("applyMention", () => {
  it("replaces the active token with @Name and a trailing space", () => {
    const result = applyMention("hello @jan world", 6, 10, "Jane Doe");
    expect(result.text).toBe("hello @Jane Doe  world");
    expect(result.caret).toBe(6 + "@Jane Doe ".length);
  });
});

describe("buildMentionFacets", () => {
  it("returns undefined when nothing matches", () => {
    expect(buildMentionFacets("no mentions here", [JANE])).toBeUndefined();
    expect(buildMentionFacets("@Jane Doe", [])).toBeUndefined();
  });

  it("builds a UTF-8 byte-slice facet for a picked mention", () => {
    const facets = buildMentionFacets("hi @Jane Doe!", [JANE]);
    expect(facets).toHaveLength(1);
    expect(facets![0]).toEqual({
      index: { byteStart: 3, byteEnd: 12 },
      features: [{ $type: MENTION_FACET_TYPE, did: JANE.did }],
    });
  });

  it("uses byte offsets, not character offsets", () => {
    // "café " is 5 chars but 6 UTF-8 bytes.
    const facets = buildMentionFacets("café @Bob", [BOB]);
    expect(facets![0].index).toEqual({ byteStart: 6, byteEnd: 10 });
  });

  it("does not tag names the author didn't pick or partial edits", () => {
    // Picked "Jane Doe" but the text was edited to "@Jane Do"
    expect(buildMentionFacets("hi @Jane Do", [JANE])).toBeUndefined();
  });

  it("prefers the longest name on overlapping candidates", () => {
    const senior = { did: "did:plc:senior", name: "Jane Doe Senior" };
    const facets = buildMentionFacets("cc @Jane Doe Senior", [JANE, senior]);
    expect(facets).toHaveLength(1);
    expect(facets![0].features[0].did).toBe(senior.did);
  });

  it("tags multiple distinct mentions in order", () => {
    const facets = buildMentionFacets("@Bob meet @Jane Doe", [JANE, BOB]);
    expect(facets).toHaveLength(2);
    expect(facets![0].features[0].did).toBe(BOB.did);
    expect(facets![1].features[0].did).toBe(JANE.did);
  });
});

describe("round trip through stored facets", () => {
  it("recovers candidates from record text + facets", () => {
    const text = "hi @Jane Doe and @Bob";
    const facets = buildMentionFacets(text, [JANE, BOB])!;
    const recovered = mentionCandidatesFromFacets(text, facets);
    expect(recovered).toEqual(expect.arrayContaining([JANE, BOB]));
    expect(mentionDidsOfFacets(facets).sort()).toEqual([BOB.did, JANE.did].sort());
  });

  it("tolerates the indexer feature shape (__typename)", () => {
    const facets = [
      {
        index: { byteStart: 0, byteEnd: 9 },
        features: [{ __typename: "AppBskyRichtextFacetMention", did: JANE.did }],
      },
    ];
    expect(mentionCandidatesFromFacets("@Jane Doe hi", facets)).toEqual([JANE]);
    expect(mentionDidsOfFacets(facets)).toEqual([JANE.did]);
  });
});

describe("segmentTextWithMentions", () => {
  it("returns one plain segment without candidates", () => {
    expect(segmentTextWithMentions("hello", [])).toEqual([{ text: "hello" }]);
  });

  it("splits text around mention tokens", () => {
    const segments = segmentTextWithMentions("hi @Jane Doe, meet @Bob!", [JANE, BOB]);
    expect(segments).toEqual([
      { text: "hi " },
      { text: "@Jane Doe", did: JANE.did },
      { text: ", meet " },
      { text: "@Bob", did: BOB.did },
      { text: "!" },
    ]);
  });

  it("works on clamped copies of the text (token matching, not offsets)", () => {
    const clamped = "… earlier context @Jane Doe trailing";
    const segments = segmentTextWithMentions(clamped, [JANE]);
    expect(segments.some((s) => s.did === JANE.did)).toBe(true);
  });

  it("does not linkify glued tokens", () => {
    const segments = segmentTextWithMentions("mail@Bob.com", [BOB]);
    expect(segments).toEqual([{ text: "mail@Bob.com" }]);
  });
});
