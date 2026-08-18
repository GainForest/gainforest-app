import { describe, expect, it } from "vitest";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { getEntriesForActivity, isAttachmentForActivity } from "./attachmentSubjects";

function attachment(
  subjectUris: Array<string | { uri: string; cid: string | null }>,
): TimelineAttachmentItem {
  return {
    metadata: { did: "did:example:org", uri: null, rkey: null, cid: null, createdAt: null, indexedAt: null },
    creatorInfo: null,
    record: {
      title: null,
      shortDescription: null,
      description: null,
      contentType: null,
      subjects: subjectUris.map((subject, index) => (
        typeof subject === "string" ? { uri: subject, cid: `cid-${index}` } : subject
      )),
      content: null,
      createdAt: null,
    },
  };
}

describe("attachment subject filtering", () => {
  const activityUri = "at://did:example:org/org.hypercerts.claim.activity/abc";

  it("matches timeline entries only by the first subject URI", () => {
    expect(isAttachmentForActivity(attachment([activityUri]), activityUri)).toBe(true);
    expect(isAttachmentForActivity(attachment([{ uri: activityUri, cid: null }]), activityUri)).toBe(true);
    expect(isAttachmentForActivity(attachment(["at://did:example:org/app.certified.location/site", activityUri]), activityUri)).toBe(false);
  });

  it("keeps overview and timeline counts aligned with the first-subject rule", () => {
    const entries = [
      attachment([activityUri]),
      attachment(["at://did:example:org/org.hypercerts.claim.activity/other", activityUri]),
      attachment([activityUri, "at://did:example:org/app.certified.location/site"]),
    ];

    expect(getEntriesForActivity(entries, activityUri)).toHaveLength(2);
  });
});
