import { describe, expect, it } from "vitest";

import {
  applyMention,
  buildMentionFacets,
  detectMentionQuery,
  mentionCandidatesFromFacets,
  mentionDidsOfFacets,
  segmentTextWithLinks,
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

describe("segmentTextWithLinks", () => {
  it("returns the whole text when there is no URL", () => {
    expect(segmentTextWithLinks("just words here")).toEqual([{ text: "just words here" }]);
  });

  it("detects explicit https URLs", () => {
    expect(segmentTextWithLinks("see https://gainforest.earth/feed now")).toEqual([
      { text: "see " },
      { text: "https://gainforest.earth/feed", href: "https://gainforest.earth/feed" },
      { text: " now" },
    ]);
  });

  it("detects bare .com and .app domains and prefixes https", () => {
    expect(segmentTextWithLinks("visit example.com and gainforest.app")).toEqual([
      { text: "visit " },
      { text: "example.com", href: "https://example.com" },
      { text: " and " },
      { text: "gainforest.app", href: "https://gainforest.app" },
    ]);
  });

  it("keeps paths on bare domains", () => {
    expect(segmentTextWithLinks("www.gainforest.app/feed rocks")).toEqual([
      { text: "www.gainforest.app/feed", href: "https://www.gainforest.app/feed" },
      { text: " rocks" },
    ]);
  });

  it("strips trailing sentence punctuation", () => {
    expect(segmentTextWithLinks("Apply at grants.gainforest.earth!")).toEqual([
      { text: "Apply at " },
      { text: "grants.gainforest.earth", href: "https://grants.gainforest.earth" },
      { text: "!" },
    ]);
  });

  it("does not linkify email addresses", () => {
    expect(segmentTextWithLinks("write to team@gainforest.app please")).toEqual([
      { text: "write to team@gainforest.app please" },
    ]);
  });

  it("does not linkify unknown TLDs or plain abbreviations", () => {
    expect(segmentTextWithLinks("e.g. this file.txt stays text")).toEqual([
      { text: "e.g. this file.txt stays text" },
    ]);
  });

  it("survives multi-line posts", () => {
    const segments = segmentTextWithLinks("line one\nsee x.com\nbye");
    expect(segments).toEqual([
      { text: "line one\nsee " },
      { text: "x.com", href: "https://x.com" },
      { text: "\nbye" },
    ]);
  });
});
