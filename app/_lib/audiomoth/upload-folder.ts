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

/** Folder names compare on trimmed, case- and whitespace-insensitive text. */
function folderNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The folder already carrying this name, if the account has one.
 *
 * An upload interrupted halfway is almost always resumed by reading the same
 * card again, which offers the same folder name — creating a second folder
 * then splits one site's recordings in two. The card's recordings belong in
 * the folder that already exists, so both the picker (which pre-selects it)
 * and the uploader (which never creates a duplicate) look it up by name.
 */
export function findUploadFolderByName<T extends UploadFolderOption>(
  folders: T[],
  name: string,
): T | null {
  const needle = folderNameKey(name);
  if (!needle) return null;
  return folders.find((folder) => folderNameKey(folder.name) === needle) ?? null;
}

/**
 * What a batch headed for a folder of a given name should do: join the
 * folder of that name if the account has one, otherwise create it. Both
 * upload pipelines (the tab and the background tray) run this before
 * writing, so neither can ever end up with two folders of the same name.
 */
export type NamedUploadFolderPlan =
  | { action: "reuse"; uri: string }
  | { action: "create"; name: string }
  | { action: "none" };

export function planNamedUploadFolder<T extends UploadFolderOption>(
  folders: T[],
  name: string,
): NamedUploadFolderPlan {
  const trimmed = name.trim();
  if (!trimmed) return { action: "none" };
  const existing = findUploadFolderByName(folders, trimmed);
  return existing ? { action: "reuse", uri: existing.uri } : { action: "create", name: trimmed };
}

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
