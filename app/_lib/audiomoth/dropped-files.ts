/**
 * Reading files out of a drag-and-drop payload, including whole directories
 * (an AudioMoth SD card dragged straight from the Finder). Shared by the
 * AudioMoth Upload tab and the quick "Add observations" modal so both walk
 * cards the same way.
 */

/** Hidden/system entries (SD cards carry .Spotlight-V100, .Trashes, …). */
export function isHiddenName(name: string | undefined): boolean {
  return !!name && name.startsWith(".");
}

/** True when the drag payload contains at least one directory entry. */
export function dropContainsDirectory(items: DataTransferItemList | null | undefined): boolean {
  for (let i = 0; i < (items?.length ?? 0); i += 1) {
    const entry = (items![i] as unknown as {
      webkitGetAsEntry?: () => { isDirectory?: boolean; name?: string } | null;
    }).webkitGetAsEntry?.();
    if (entry?.isDirectory && !isHiddenName(entry.name)) return true;
  }
  return false;
}

/**
 * The name of the first (non-hidden) directory in the drag payload. Must be
 * read synchronously, before the drop event settles.
 */
export function droppedFolderName(items: DataTransferItemList | null | undefined): string {
  for (let i = 0; i < (items?.length ?? 0); i += 1) {
    const entry = (items![i] as unknown as {
      webkitGetAsEntry?: () => { isDirectory?: boolean; name?: string } | null;
    }).webkitGetAsEntry?.();
    if (entry?.isDirectory && entry.name && !isHiddenName(entry.name)) return entry.name;
  }
  return "";
}

/**
 * Recursively collect files from a drag-and-dropped directory entry.
 * Hidden/system folders are skipped and unreadable entries are ignored —
 * FAT-formatted SD cards are full of both.
 */
export async function collectDroppedFiles(
  items: DataTransferItemList,
  onProgress?: (count: number) => void,
): Promise<File[]> {
  const out: File[] = [];

  async function walkEntry(entry: unknown): Promise<void> {
    const e = entry as {
      name?: string;
      isFile?: boolean;
      isDirectory?: boolean;
      file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
      createReader?: () => { readEntries: (cb: (entries: unknown[]) => void, err: (e: unknown) => void) => void };
    };
    if (isHiddenName(e?.name)) return;
    if (e?.isFile && e.file) {
      const file = await new Promise<File | null>((resolve) => e.file!(resolve, () => resolve(null)));
      if (file) {
        out.push(file);
        if (out.length % 50 === 0) onProgress?.(out.length);
      }
    } else if (e?.isDirectory && e.createReader) {
      const reader = e.createReader();
      // readEntries returns batches; keep reading until empty
      for (;;) {
        const batch = await new Promise<unknown[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (batch.length === 0) break;
        for (const child of batch) await walkEntry(child).catch(() => undefined);
      }
    }
  }

  const entries: unknown[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const entry = (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  for (const entry of entries) await walkEntry(entry).catch(() => undefined);
  onProgress?.(out.length);
  return out;
}
