/**
 * In-memory handoff for the unified "Add data" drop zone.
 *
 * Files can't ride along in a URL, so when the Add data page auto-detects a drop
 * it stashes the File[] here, then client-navigates to the matching flow. That
 * flow reads (and clears) the handoff once on mount and ingests the files as if
 * they'd been dropped there directly.
 *
 * This is a deliberately tiny module singleton: it only needs to survive a
 * same-tab client navigation. A hard reload clears it, which is fine — the user
 * simply lands on the flow's normal empty state and can re-drop.
 */

import type { UploadKind } from "./detect-upload-type";

type Handoff = {
  kind: UploadKind;
  files: File[];
  /** When the handoff was created, so stale entries can be ignored. */
  createdAt: number;
};

// A handoff is only meaningful for the very next navigation. If it hasn't been
// consumed within this window we treat it as stale and drop it, so a file can
// never resurface unexpectedly on a later, unrelated visit to a flow.
const HANDOFF_TTL_MS = 30_000;

let pending: Handoff | null = null;

export function setAddDataHandoff(kind: UploadKind, files: File[]): void {
  pending = files.length > 0 ? { kind, files, createdAt: Date.now() } : null;
}

/**
 * Read and clear the handoff for a given kind. Returns the files only when a
 * fresh handoff for that exact kind is waiting; otherwise an empty array.
 */
export function takeAddDataHandoff(kind: UploadKind): File[] {
  const current = pending;
  if (!current || current.kind !== kind) return [];
  pending = null;
  if (Date.now() - current.createdAt > HANDOFF_TTL_MS) return [];
  return current.files;
}
