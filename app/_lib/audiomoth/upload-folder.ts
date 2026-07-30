/**
 * Choosing where an SD-card batch lands: an existing folder (one of the
 * account's `ac.deployment` records, which is what groups recordings on the
 * profile) or a brand-new one.
 *
 * Repeated uploads from the same site used to end up scattered across
 * one-off folders, because the uploader only ever offered "name this
 * upload". The rules below decide which of the two modes is actually
 * available and when the batch is allowed to start.
 */

/** The bits of an `ac.deployment` the folder picker needs. */
export type UploadFolderOption = { uri: string; name: string };

export type UploadFolderMode = "existing" | "new";

/**
 * The mode actually in effect. Picking an existing folder is the default,
 * but an account with no folders yet has nothing to pick from — it always
 * names a new one.
 */
export function activeUploadFolderMode(mode: UploadFolderMode, folderCount: number): UploadFolderMode {
  return folderCount > 0 ? mode : "new";
}

/**
 * Case-insensitive substring match on the folder name; blank query = all.
 * A folder already selected (`keepUri`) always stays in the list, so a
 * search can never hide the choice the batch is about to be uploaded into.
 */
export function filterUploadFolders<T extends UploadFolderOption>(
  folders: T[],
  query: string,
  keepUri?: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return folders;
  return folders.filter(
    (folder) => folder.name.toLowerCase().includes(needle) || (!!keepUri && folder.uri === keepUri),
  );
}

/**
 * Whether the batch has somewhere to go: a folder was selected, or a name
 * for a new one was typed. Batches whose recordings all matched a
 * deployment by acoustic chime need no choice at all.
 */
export function isUploadFolderChosen(input: {
  /** At least one group would otherwise land in "Other recordings". */
  needsFolder: boolean;
  mode: UploadFolderMode;
  selectedFolderUri: string;
  newFolderName: string;
}): boolean {
  if (!input.needsFolder) return true;
  return input.mode === "existing"
    ? input.selectedFolderUri.trim().length > 0
    : input.newFolderName.trim().length > 0;
}
