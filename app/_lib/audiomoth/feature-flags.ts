/**
 * Server-side release switch for the background upload tray.
 *
 * The tray moves SD-card uploads off the AudioMoth page and into an app-wide
 * docked panel, so transfers keep running while people browse. It is still
 * being finished, so it defaults OFF: the Upload tab keeps its full-page
 * progress flow until AUDIOMOTH_UPLOAD_TRAY_ENABLED=true is set. Only "true"
 * turns it on, so a stray value can never ship half-built behaviour.
 */
export function isAudioMothUploadTrayFlagEnabled(
  value = process.env.AUDIOMOTH_UPLOAD_TRAY_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
