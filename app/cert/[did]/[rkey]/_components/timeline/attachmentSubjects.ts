import type { TimelineAttachmentItem } from "@/app/_lib/indexer";

export type AttachmentSubjectInfo = { uri: string; cid: string };

type PersistedAttachmentSubject = { uri: string | null; cid: string | null };

export type AttachmentStrongRef = AttachmentSubjectInfo & {
  $type: "com.atproto.repo.strongRef";
};

export function isValidAttachmentSubjectInfo(
  subject: AttachmentSubjectInfo | null | undefined,
): subject is AttachmentSubjectInfo {
  return Boolean(subject?.uri && subject.cid);
}

export function createOrderedAttachmentSubjects(args: {
  activitySubject: AttachmentSubjectInfo;
  contextualSubjects?: AttachmentSubjectInfo[];
}): AttachmentSubjectInfo[] {
  if (!isValidAttachmentSubjectInfo(args.activitySubject)) return [];

  const subjects: AttachmentSubjectInfo[] = [args.activitySubject];
  const seenUris = new Set<string>([args.activitySubject.uri]);

  for (const subject of args.contextualSubjects ?? []) {
    if (!isValidAttachmentSubjectInfo(subject) || seenUris.has(subject.uri)) continue;
    seenUris.add(subject.uri);
    subjects.push(subject);
  }

  return subjects;
}

export function toAttachmentStrongRefs(subjects: AttachmentSubjectInfo[]): AttachmentStrongRef[] {
  return subjects.map((subject) => ({
    $type: "com.atproto.repo.strongRef",
    uri: subject.uri,
    cid: subject.cid,
  }));
}

function normalizePersistedSubject(
  subject: PersistedAttachmentSubject | null | undefined,
): AttachmentSubjectInfo | null {
  if (!subject?.uri || !subject.cid) return null;
  return { uri: subject.uri, cid: subject.cid };
}

export function getAttachmentContextSubject(
  subjects: TimelineAttachmentItem["record"]["subjects"] | null | undefined,
): AttachmentSubjectInfo | null {
  return normalizePersistedSubject(subjects?.[1]);
}

export function isAttachmentForActivity(
  item: TimelineAttachmentItem,
  activityUri: string,
): boolean {
  return item.record.subjects?.[0]?.uri === activityUri;
}

export function getEntriesForActivity(
  data: readonly TimelineAttachmentItem[] | undefined,
  activityUri: string,
): TimelineAttachmentItem[] {
  return (data ?? []).filter((item) => isAttachmentForActivity(item, activityUri));
}

/**
 * Match an attachment against any of several activity URIs. Used on the project
 * page, where a project's timeline evidence may be pinned to the project
 * (collection) URI — the historical subject — *or* to the project's single Cert
 * (claim.activity) URI, which is where the evidence adder writes today. Without
 * the union, legacy evidence attached to the collection disappears once the
 * Cert detail (keyed on the claim.activity URI) is rendered on the project page.
 */
export function isAttachmentForAnyActivity(
  item: TimelineAttachmentItem,
  activityUris: readonly string[],
): boolean {
  const subjectUri = item.record.subjects?.[0]?.uri;
  return Boolean(subjectUri && activityUris.includes(subjectUri));
}

export function getEntriesForActivities(
  data: readonly TimelineAttachmentItem[] | undefined,
  activityUris: readonly string[],
): TimelineAttachmentItem[] {
  return (data ?? []).filter((item) => isAttachmentForAnyActivity(item, activityUris));
}
