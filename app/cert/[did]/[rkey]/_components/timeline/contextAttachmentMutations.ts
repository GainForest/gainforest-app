import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { parseAtUri } from "./atUri";
import {
  createOrderedAttachmentSubjects,
  isValidAttachmentSubjectInfo,
  toAttachmentStrongRefs,
  type AttachmentSubjectInfo,
} from "./attachmentSubjects";

export const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";
export const ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPTED_MIME_TYPES = ["*/*"] as const;

const CONTENT_TYPE_TREE_DATASET = "tree-dataset";
const MAX_ATTACHMENT_CONTENT_ITEMS = 100;
const MAX_ATTACHMENT_SUBJECTS = 100;
const MAX_ATTACHMENT_TITLE_LENGTH = 256;
const MAX_ATTACHMENT_CONTENT_TYPE_LENGTH = 64;
const MAX_ATTACHMENT_NOTE_LENGTH = 250_000;
const DEFAULT_MIME_TYPE = "application/octet-stream";

type AttachmentContentInput = string | File;

export type AttachmentDraft = {
  title: string;
  contentType: string;
  contents: AttachmentContentInput[];
  note?: string;
  /**
   * Long-form plaintext body stored as a `pub.leaflet.pages.linearDocument`
   * description (one text block per paragraph). Used for text updates, which
   * may have no `contents` at all.
   */
  textBody?: string;
  contextualSubjects?: AttachmentSubjectInfo[];
};

export type AttachmentMutationInputErrorCode =
  | "empty-content"
  | "invalid-activity"
  | "invalid-context"
  | "invalid-link"
  | "too-many-items"
  | "title-required"
  | "title-too-long"
  | "content-type-too-long"
  | "note-too-long"
  | "file-too-large"
  | "file-type-not-allowed"
  | "invalid-record"
  | "missing-rkey"
  | "not-found";

export class AttachmentMutationInputError extends Error {
  code: AttachmentMutationInputErrorCode;

  constructor(code: AttachmentMutationInputErrorCode) {
    super(code);
    this.name = "AttachmentMutationInputError";
    this.code = code;
  }
}

export function isAttachmentMutationInputError(error: unknown): error is AttachmentMutationInputError {
  return error instanceof AttachmentMutationInputError;
}

type UploadedBlobLike = {
  ref?: unknown;
  mimeType?: unknown;
  size?: unknown;
  blob?: unknown;
};

type AttachmentUriContent = { $type: "org.hypercerts.defs#uri"; uri: string };
type AttachmentSmallBlobContent = {
  $type: "org.hypercerts.defs#smallBlob";
  blob: {
    $type: "blob";
    ref?: unknown;
    uri?: string | null;
    cid?: string | null;
    name?: string | null;
    mimeType: string;
    size: number;
  };
};
type AttachmentRecordContent = AttachmentUriContent | AttachmentSmallBlobContent;

type AttachmentLinearDocumentDescription = {
  $type: "pub.leaflet.pages.linearDocument";
  blocks: Array<{
    $type: "pub.leaflet.pages.linearDocument#block";
    block: { $type: "pub.leaflet.blocks.text"; plaintext: string };
  }>;
};

type AttachmentDescription =
  | { $type: "org.hypercerts.defs#descriptionString"; value: string }
  | AttachmentLinearDocumentDescription;

type ContextAttachmentRecord = {
  $type: typeof ATTACHMENT_COLLECTION;
  title: string;
  contentType?: string;
  subjects?: ReturnType<typeof toAttachmentStrongRefs>;
  content?: AttachmentRecordContent[];
  description?: AttachmentDescription;
  createdAt: string;
};

function buildLinearDocumentDescription(text: string): AttachmentLinearDocumentDescription {
  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return {
    $type: "pub.leaflet.pages.linearDocument",
    blocks: (paragraphs.length > 0 ? paragraphs : [text]).map((plaintext) => ({
      $type: "pub.leaflet.pages.linearDocument#block",
      block: { $type: "pub.leaflet.blocks.text", plaintext },
    })),
  };
}

function buildDraftDescription(draft: Pick<AttachmentDraft, "note" | "textBody">): AttachmentDescription | null {
  const textBody = draft.textBody?.trim();
  if (textBody) return buildLinearDocumentDescription(textBody);
  const note = draft.note?.trim();
  if (note) return { $type: "org.hypercerts.defs#descriptionString", value: note };
  return null;
}

export type CreatedContextAttachment = {
  uri: string;
  cid: string;
  rkey: string;
  record: ContextAttachmentRecord;
};

export type ContextAttachmentMutationResult = {
  created: CreatedContextAttachment;
  optimisticItem: TimelineAttachmentItem;
};

async function getMutationApi() {
  return import("../../../../../(manage)/manage/_lib/mutations");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeMimeType(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_MIME_TYPE;
}

function mimeMatches(mimeType: string, pattern: string): boolean {
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) return mimeType.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
  return mimeType.toLowerCase() === pattern.toLowerCase();
}

function isSupportedAttachmentMimeType(mimeType: string): boolean {
  return ATTACHMENT_ACCEPTED_MIME_TYPES.some((pattern) => mimeMatches(mimeType, pattern));
}

function isValidUri(value: string): boolean {
  if (value.startsWith("at://")) return parseAtUri(value) !== null;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol);
  } catch {
    return false;
  }
}

function isCertifiedLocationSubject(subject: AttachmentSubjectInfo): boolean {
  return parseAtUri(subject.uri)?.collection === "app.certified.location";
}

function isTreeDatasetAttachment(draft: Pick<AttachmentDraft, "contentType">): boolean {
  return draft.contentType.trim().toLowerCase() === CONTENT_TYPE_TREE_DATASET;
}

function stubBlobContent(file: File): AttachmentSmallBlobContent {
  return {
    $type: "org.hypercerts.defs#smallBlob",
    blob: {
      $type: "blob",
      ref: { $link: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" },
      mimeType: normalizeMimeType(file.type),
      size: file.size,
    },
  };
}

function toUriContent(uri: string): AttachmentUriContent {
  return { $type: "org.hypercerts.defs#uri", uri };
}

function toLexBlobRef(uploaded: UploadedBlobLike, file: File): AttachmentSmallBlobContent["blob"] {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) {
    throw new AttachmentMutationInputError("invalid-record");
  }

  return {
    $type: "blob",
    ref: raw.ref,
    mimeType: normalizeMimeType(typeof raw.mimeType === "string" ? raw.mimeType : file.type),
    size: typeof raw.size === "number" ? raw.size : file.size,
  };
}

function toRecordBlobContent(uploaded: UploadedBlobLike, file: File): AttachmentSmallBlobContent {
  return {
    $type: "org.hypercerts.defs#smallBlob",
    blob: toLexBlobRef(uploaded, file),
  };
}

function toOptimisticBlobContent(file: File, uploaded: UploadedBlobLike): AttachmentSmallBlobContent {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  return {
    $type: "org.hypercerts.defs#smallBlob",
    blob: {
      $type: "blob",
      uri: URL.createObjectURL(file),
      cid: null,
      name: file.name,
      mimeType: normalizeMimeType(typeof raw.mimeType === "string" ? raw.mimeType : file.type),
      size: file.size,
    },
  };
}

export function validateAttachmentFile(file: File): void {
  if (file.size > ATTACHMENT_MAX_FILE_BYTES) {
    throw new AttachmentMutationInputError("file-too-large");
  }

  if (!isSupportedAttachmentMimeType(normalizeMimeType(file.type))) {
    throw new AttachmentMutationInputError("file-type-not-allowed");
  }
}

function validateAttachmentDraft(args: {
  draft: AttachmentDraft;
  activitySubject: AttachmentSubjectInfo;
}): void {
  const title = args.draft.title.trim();
  const contentType = args.draft.contentType.trim();
  const note = args.draft.note?.trim() ?? "";
  const textBody = args.draft.textBody?.trim() ?? "";

  if (!isValidAttachmentSubjectInfo(args.activitySubject)) {
    throw new AttachmentMutationInputError("invalid-activity");
  }

  if (args.draft.contents.length === 0 && !note && !textBody) {
    throw new AttachmentMutationInputError("empty-content");
  }

  if (args.draft.contents.length > MAX_ATTACHMENT_CONTENT_ITEMS) {
    throw new AttachmentMutationInputError("too-many-items");
  }

  if (!title) {
    throw new AttachmentMutationInputError("title-required");
  }

  if (title.length > MAX_ATTACHMENT_TITLE_LENGTH) {
    throw new AttachmentMutationInputError("title-too-long");
  }

  if (contentType.length > MAX_ATTACHMENT_CONTENT_TYPE_LENGTH) {
    throw new AttachmentMutationInputError("content-type-too-long");
  }

  if (note.length > MAX_ATTACHMENT_NOTE_LENGTH) {
    throw new AttachmentMutationInputError("note-too-long");
  }

  if (textBody.length > MAX_ATTACHMENT_NOTE_LENGTH) {
    throw new AttachmentMutationInputError("note-too-long");
  }

  for (const content of args.draft.contents) {
    if (typeof content === "string") {
      if (!isValidUri(content)) throw new AttachmentMutationInputError("invalid-link");
    } else {
      validateAttachmentFile(content);
    }
  }

  if (isTreeDatasetAttachment(args.draft)) {
    const siteSubject = args.draft.contextualSubjects?.find(isValidAttachmentSubjectInfo);
    if (!siteSubject || !isCertifiedLocationSubject(siteSubject)) {
      throw new AttachmentMutationInputError("invalid-context");
    }
  }
}

function buildContextAttachmentRecord(args: {
  draft: AttachmentDraft;
  subjects: AttachmentSubjectInfo[];
  content: AttachmentRecordContent[];
  createdAt?: string;
}): ContextAttachmentRecord {
  const title = args.draft.title.trim();
  const contentType = args.draft.contentType.trim();
  const description = buildDraftDescription(args.draft);
  const record: ContextAttachmentRecord = {
    $type: ATTACHMENT_COLLECTION,
    title,
    createdAt: args.createdAt ?? new Date().toISOString(),
  };

  if (contentType) record.contentType = contentType;
  if (args.subjects.length > 0) record.subjects = toAttachmentStrongRefs(args.subjects);
  if (args.content.length > 0) record.content = args.content;
  if (description) record.description = description;

  return record;
}

function validateContextAttachmentRecord(record: ContextAttachmentRecord): void {
  if (record.$type !== ATTACHMENT_COLLECTION) throw new AttachmentMutationInputError("invalid-record");
  if (!record.title || record.title.length > MAX_ATTACHMENT_TITLE_LENGTH) throw new AttachmentMutationInputError("invalid-record");
  if (!record.createdAt || Number.isNaN(Date.parse(record.createdAt))) throw new AttachmentMutationInputError("invalid-record");
  if (record.contentType && record.contentType.length > MAX_ATTACHMENT_CONTENT_TYPE_LENGTH) throw new AttachmentMutationInputError("invalid-record");

  if (record.description) {
    if (record.description.$type === "org.hypercerts.defs#descriptionString") {
      if (record.description.value.length > MAX_ATTACHMENT_NOTE_LENGTH) throw new AttachmentMutationInputError("invalid-record");
    } else {
      const blocks = record.description.blocks;
      if (blocks.length === 0) throw new AttachmentMutationInputError("invalid-record");
      const totalLength = blocks.reduce((sum, entry) => sum + entry.block.plaintext.length, 0);
      if (totalLength === 0 || totalLength > MAX_ATTACHMENT_NOTE_LENGTH) throw new AttachmentMutationInputError("invalid-record");
    }
  }

  if (record.subjects) {
    if (record.subjects.length > MAX_ATTACHMENT_SUBJECTS) throw new AttachmentMutationInputError("invalid-record");
    for (const subject of record.subjects) {
      if (subject.$type !== "com.atproto.repo.strongRef" || !subject.uri.startsWith("at://") || !subject.cid) {
        throw new AttachmentMutationInputError("invalid-record");
      }
    }
  }

  if (record.content) {
    if (record.content.length > MAX_ATTACHMENT_CONTENT_ITEMS) throw new AttachmentMutationInputError("invalid-record");
    for (const item of record.content) {
      if (item.$type === "org.hypercerts.defs#uri") {
        if (!isValidUri(item.uri)) throw new AttachmentMutationInputError("invalid-record");
        continue;
      }
      if (item.$type === "org.hypercerts.defs#smallBlob") {
        if (!item.blob || item.blob.$type !== "blob" || !item.blob.mimeType || typeof item.blob.size !== "number") {
          throw new AttachmentMutationInputError("invalid-record");
        }
        if (item.blob.size > ATTACHMENT_MAX_FILE_BYTES || !isSupportedAttachmentMimeType(item.blob.mimeType)) {
          throw new AttachmentMutationInputError("invalid-record");
        }
        if (item.blob.ref === undefined && !item.blob.uri) throw new AttachmentMutationInputError("invalid-record");
        continue;
      }
      throw new AttachmentMutationInputError("invalid-record");
    }
  }
}

export function buildStubContextAttachmentRecord(args: {
  draft: AttachmentDraft;
  activitySubject: AttachmentSubjectInfo;
  createdAt?: string;
}): ContextAttachmentRecord {
  validateAttachmentDraft({ draft: args.draft, activitySubject: args.activitySubject });
  const subjects = createOrderedAttachmentSubjects({
    activitySubject: args.activitySubject,
    contextualSubjects: args.draft.contextualSubjects,
  });
  const content = args.draft.contents.map((item) => (typeof item === "string" ? toUriContent(item) : stubBlobContent(item)));
  const record = buildContextAttachmentRecord({ draft: args.draft, subjects, content, createdAt: args.createdAt });
  validateContextAttachmentRecord(record);
  return record;
}

export function buildOptimisticAttachmentItem(args: {
  did: string;
  created: Pick<CreatedContextAttachment, "uri" | "cid" | "rkey">;
  draft: AttachmentDraft;
  activitySubject: AttachmentSubjectInfo;
  content: AttachmentRecordContent[];
}): TimelineAttachmentItem {
  const createdAt = new Date().toISOString();
  const subjects = createOrderedAttachmentSubjects({
    activitySubject: args.activitySubject,
    contextualSubjects: args.draft.contextualSubjects,
  });

  return {
    metadata: {
      did: args.did,
      uri: args.created.uri,
      rkey: args.created.rkey,
      cid: args.created.cid,
      createdAt,
      indexedAt: createdAt,
    },
    creatorInfo: {
      did: args.did,
      organizationName: null,
      organizationLogo: null,
    },
    record: {
      title: args.draft.title.trim(),
      shortDescription: null,
      description: buildDraftDescription(args.draft),
      contentType: args.draft.contentType.trim() || null,
      subjects,
      content: args.content,
      createdAt,
    },
  };
}

export async function createContextAttachment(args: {
  draft: AttachmentDraft;
  activitySubject: AttachmentSubjectInfo;
  organizationDid: string;
  repo?: string;
}): Promise<ContextAttachmentMutationResult> {
  const createdAt = new Date().toISOString();
  buildStubContextAttachmentRecord({ draft: args.draft, activitySubject: args.activitySubject, createdAt });

  const subjects = createOrderedAttachmentSubjects({
    activitySubject: args.activitySubject,
    contextualSubjects: args.draft.contextualSubjects,
  });
  const recordContent: AttachmentRecordContent[] = [];
  const optimisticContent: AttachmentRecordContent[] = [];
  const mutationApi = await getMutationApi();

  for (const content of args.draft.contents) {
    if (typeof content === "string") {
      const uriContent = toUriContent(content);
      recordContent.push(uriContent);
      optimisticContent.push(uriContent);
      continue;
    }

    validateAttachmentFile(content);
    const uploaded = await mutationApi.uploadBlob(content, args.repo ? { repo: args.repo } : undefined);
    recordContent.push(toRecordBlobContent(uploaded, content));
    optimisticContent.push(toOptimisticBlobContent(content, uploaded));
  }

  const record = buildContextAttachmentRecord({ draft: args.draft, subjects, content: recordContent, createdAt });
  validateContextAttachmentRecord(record);

  const result = await mutationApi.createRecord(ATTACHMENT_COLLECTION, record, undefined, args.repo ? { repo: args.repo } : undefined);
  const rkey = result.uri.split("/").pop() ?? "";
  if (!rkey) throw new AttachmentMutationInputError("invalid-record");

  const created = { uri: result.uri, cid: result.cid, rkey, record };
  return {
    created,
    optimisticItem: buildOptimisticAttachmentItem({
      did: args.organizationDid,
      created,
      draft: args.draft,
      activitySubject: args.activitySubject,
      content: optimisticContent,
    }),
  };
}

export async function deleteContextAttachment(args: {
  rkey: string | null | undefined;
  repo?: string;
}): Promise<{ uri: string; rkey: string }> {
  const rkey = args.rkey?.trim();
  if (!rkey) throw new AttachmentMutationInputError("missing-rkey");

  const mutationApi = await getMutationApi();

  let existing: { uri?: string } = {};
  try {
    existing = await mutationApi.getRecord(ATTACHMENT_COLLECTION, rkey, args.repo ? { repo: args.repo } : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not found") || message.includes("could not be loaded")) {
      throw new AttachmentMutationInputError("not-found");
    }
    throw error;
  }

  await mutationApi.deleteRecord(ATTACHMENT_COLLECTION, rkey, args.repo ? { repo: args.repo } : undefined);
  return { uri: existing.uri ?? (args.repo ? `at://${args.repo}/${ATTACHMENT_COLLECTION}/${rkey}` : ""), rkey };
}
