/**
 * Validation for AudioMoth object-storage keys — shared shape between the
 * upload presign, the download redirect, and the deletion endpoint.
 *
 * Keys look like `audiomoth/{did}/{deploymentId|unassigned}/{filename}` and
 * are written verbatim with the uploader's DID, so ownership is a plain
 * case-sensitive prefix check.
 */

/** audiomoth/{did}/{deploymentId or "unassigned"}/{filename} */
export const AUDIOMOTH_KEY_PATTERN =
  /^audiomoth\/did:[a-z0-9:%.\-_]+\/(?:[0-9a-f]{16}|unassigned)\/[A-Za-z0-9._\-]{1,200}$/i;

/**
 * Whether `key` is something the given signed-in DID may delete:
 *  - matches the general audiomoth key shape (nothing outside the namespace),
 *  - is a real `.wav` object — the only kind the PUT presign ever creates,
 *  - has no `.`/`..` segments (the char class would otherwise admit them;
 *    they only fail today because URL normalization breaks the signature),
 *  - and lives inside the caller's own DID namespace.
 */
export function isDeletableAudiomothKey(key: string, sessionDid: string): "ok" | "not_found" | "forbidden" {
  if (
    !AUDIOMOTH_KEY_PATTERN.test(key) ||
    !/\.wav$/i.test(key) ||
    key.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return "not_found";
  }
  if (!key.startsWith(`audiomoth/${sessionDid}/`)) {
    return "forbidden";
  }
  return "ok";
}
