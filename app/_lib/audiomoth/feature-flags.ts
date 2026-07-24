/**
 * Server-side release switch for the AudioMoth spectrogram labelling workspace.
 *
 * The workspace is open to every signed-in user. Set
 * AUDIOMOTH_LABELLING_ENABLED=false to remove it for everyone without a code
 * change. It defaults on.
 */
export function isAudioMothLabellingFlagEnabled(
  value = process.env.AUDIOMOTH_LABELLING_ENABLED,
): boolean {
  return value?.trim().toLowerCase() !== "false";
}
