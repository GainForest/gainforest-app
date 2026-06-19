import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_COLLECTION,
  ATTACHMENT_MAX_FILE_BYTES,
  AttachmentMutationInputError,
  buildOptimisticAttachmentItem,
  buildStubContextAttachmentRecord,
  validateAttachmentFile,
  type AttachmentDraft,
} from "./contextAttachmentMutations";

const activitySubject = {
  uri: "at://did:example:org/org.hypercerts.claim.activity/abc",
  cid: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
};

const siteSubject = {
  uri: "at://did:example:org/app.certified.location/site",
  cid: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
};

function draft(overrides: Partial<AttachmentDraft> = {}): AttachmentDraft {
  return {
    title: "Tree group",
    contentType: "tree-dataset",
    contents: ["at://did:example:org/app.gainforest.dwc.dataset/trees"],
    contextualSubjects: [siteSubject],
    ...overrides,
  };
}

describe("context attachment mutation helpers", () => {
  it("builds source-truth-shaped records with the activity subject first and site context second", () => {
    const record = buildStubContextAttachmentRecord({
      draft: draft({ note: "Field team upload" }),
      activitySubject,
      createdAt: "2026-01-02T03:04:05.000Z",
    });

    expect(record.$type).toBe(ATTACHMENT_COLLECTION);
    expect(record.subjects).toEqual([
      { $type: "com.atproto.repo.strongRef", ...activitySubject },
      { $type: "com.atproto.repo.strongRef", ...siteSubject },
    ]);
    expect(record.content).toEqual([
      { $type: "org.hypercerts.defs#uri", uri: "at://did:example:org/app.gainforest.dwc.dataset/trees" },
    ]);
    expect(record.description).toEqual({
      $type: "org.hypercerts.defs#descriptionString",
      value: "Field team upload",
    });
    expect(record.createdAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("blocks tree evidence when the certified location context is missing", () => {
    expect(() =>
      buildStubContextAttachmentRecord({
        draft: draft({ contextualSubjects: [] }),
        activitySubject,
      }),
    ).toThrow(new AttachmentMutationInputError("invalid-context"));
  });

  it("blocks invalid links before records are written", () => {
    expect(() =>
      buildStubContextAttachmentRecord({
        draft: draft({ contentType: "document", contents: ["not a link"], contextualSubjects: [] }),
        activitySubject,
      }),
    ).toThrow(new AttachmentMutationInputError("invalid-link"));
  });

  it("blocks oversized files before upload", () => {
    const file = new File([new Uint8Array(1)], "too-large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: ATTACHMENT_MAX_FILE_BYTES + 1 });

    expect(() => validateAttachmentFile(file)).toThrow(new AttachmentMutationInputError("file-too-large"));
  });

  it("builds source-truth-aligned optimistic blob items", () => {
    const item = buildOptimisticAttachmentItem({
      did: "did:example:org",
      created: {
        uri: "at://did:example:org/org.hypercerts.context.attachment/att",
        cid: "bafkreiattachment",
        rkey: "att",
      },
      draft: draft({ contentType: "document", contextualSubjects: [], contents: [] }),
      activitySubject,
      content: [
        {
          $type: "org.hypercerts.defs#smallBlob",
          blob: {
            $type: "blob",
            uri: "blob:http://local",
            cid: null,
            name: "field-note.pdf",
            mimeType: "application/pdf",
            size: 123,
          },
        },
      ],
    });

    expect(item.metadata.indexedAt).toBe(item.metadata.createdAt);
    expect(item.record.content).toEqual([
      {
        $type: "org.hypercerts.defs#smallBlob",
        blob: expect.objectContaining({ cid: null, name: "field-note.pdf" }),
      },
    ]);
  });
});
