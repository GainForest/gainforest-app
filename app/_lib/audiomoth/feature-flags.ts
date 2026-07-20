/**
 * Server-side release switch for the AudioMoth spectrogram labelling workspace.
 *
 * The feature is still separately restricted to GainForest admin-group members.
 * Set AUDIOMOTH_LABELLING_ENABLED=false to remove it for everyone without a
 * code change. It defaults on so admins can review it when this lands on main.
 */
export function isAudioMothLabellingFlagEnabled(
  value = process.env.AUDIOMOTH_LABELLING_ENABLED,
): boolean {
  return value?.trim().toLowerCase() !== "false";
}
