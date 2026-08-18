"use client";

/**
 * Keeps every analyzed folder's soundscape published — the timing-and-writes
 * half of `lib/soundscape/auto-publish.ts`.
 *
 * Whenever the drafts differ from what this session last wrote, a flush is
 * scheduled: almost immediately when the analysis queue is idle (opening the
 * tab on an already-analyzed library publishes it), and at most once every
 * {@link AUTO_PUBLISH_MIN_INTERVAL_MS} while recordings are still being
 * analyzed — so a long run updates the published record every half minute,
 * not after every file.
 *
 * Before each write the folder's existing record is re-read and compared
 * (`decideAutoWrite`): identical content is skipped, and the note — the
 * author's own words, written when sharing — is always carried forward. The
 * re-read also keeps a share from another surface (or another browser mid-
 * analysis) from being clobbered with stale words. Failures stay silent and
 * dirty; the next pass retries.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchPublishedSoundscape, putSoundscapeRecord } from "@/app/_lib/soundscape-record";
import { buildAutoDrafts, decideAutoWrite, type AutoDraft, type AutoPublishEntry, type AutoPublishFolder } from "@/lib/soundscape/auto-publish";

/** Floor between writes while analysis is running. */
const AUTO_PUBLISH_MIN_INTERVAL_MS = 30_000;
/** Settle delay once the queue is idle — lets a burst of state land first. */
const AUTO_PUBLISH_SETTLE_MS = 1_200;
/** Backoff before retrying after a failed write. */
const AUTO_PUBLISH_RETRY_MS = 45_000;

export function useAutoPublishSoundscapes({
  enabled,
  libraryDid,
  repo,
  entries,
  folders,
  analysisRunning,
  titleFor,
}: {
  /** Signed in, and the library belongs to the acting account. */
  enabled: boolean;
  /** The repo the library (and the records) belong to. */
  libraryDid: string | null;
  /** Group repo DID when acting as an organization. */
  repo: string | undefined;
  /** Every analyzed recording in the library — all folders, not just the
   *  selected one, so a visit heals the whole account. */
  entries: readonly AutoPublishEntry[];
  folders: readonly AutoPublishFolder[];
  /** True while the analysis queue is actively working. */
  analysisRunning: boolean;
  /** Generated record title for one folder draft (localized upstream). */
  titleFor: (draft: AutoDraft) => string;
}): {
  /** rkeys whose published record is confirmed live (written or found). */
  publishedRkeys: ReadonlySet<string>;
} {
  const [publishedRkeys, setPublishedRkeys] = useState<ReadonlySet<string>>(new Set());
  /** `signature + title` last confirmed on the PDS, per rkey. */
  const writtenRef = useRef(new Map<string, string>());
  const flushingRef = useRef(false);
  const lastWriteAtRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drafts = useMemo(() => buildAutoDrafts(entries, folders), [entries, folders]);

  /* Fresh render values for the async flush, without re-running the
     scheduling effect when only identities change. */
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const titleForRef = useRef(titleFor);
  titleForRef.current = titleFor;

  /* A different account is a different set of records: forget what this
     session wrote and re-verify against the new repo. */
  useEffect(() => {
    writtenRef.current.clear();
    setPublishedRkeys(new Set());
  }, [libraryDid]);

  const markOf = (draft: AutoDraft, title: string) => `${draft.signature}\n${title}`;

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setRetryTick((tick) => tick + 1);
    }, AUTO_PUBLISH_RETRY_MS);
  }, []);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      const did = libraryDid;
      if (!did) return;
      for (const draft of draftsRef.current) {
        const title = titleForRef.current(draft);
        const mark = markOf(draft, title);
        if (writtenRef.current.get(draft.rkey) === mark) continue;
        try {
          /* Re-read before every write: the record may already match (another
             browser, an earlier session), and its note is the author's own —
             `decideAutoWrite` keeps it either way. */
          const existing = await fetchPublishedSoundscape(did, draft.rkey);
          const decision = decideAutoWrite(existing, { signature: draft.signature, title });
          if (decision.write) {
            await putSoundscapeRecord(
              draft.rkey,
              {
                title,
                note: decision.note,
                ceilingHz: draft.ceilingHz,
                sources: draft.sources,
              },
              repo ? { repo } : undefined,
            );
            lastWriteAtRef.current = Date.now();
          }
          writtenRef.current.set(draft.rkey, mark);
          setPublishedRkeys((current) =>
            current.has(draft.rkey) ? current : new Set(current).add(draft.rkey),
          );
        } catch {
          // Stays dirty; a later pass (or the retry timer) tries again.
          scheduleRetry();
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [libraryDid, repo, scheduleRetry]);

  useEffect(() => {
    if (!enabled || !libraryDid || drafts.length === 0) return;
    const dirty = drafts.some(
      (draft) => writtenRef.current.get(draft.rkey) !== markOf(draft, titleForRef.current(draft)),
    );
    if (!dirty) return;
    const sinceLastWrite = Date.now() - lastWriteAtRef.current;
    const delay = analysisRunning
      ? Math.max(AUTO_PUBLISH_SETTLE_MS, AUTO_PUBLISH_MIN_INTERVAL_MS - sinceLastWrite)
      : AUTO_PUBLISH_SETTLE_MS;
    const timer = setTimeout(() => void flush(), delay);
    return () => clearTimeout(timer);
  }, [analysisRunning, drafts, enabled, flush, libraryDid, retryTick]);

  return { publishedRkeys };
}
