/**
 * Shared Tainá constants safe for both server and client imports.
 *
 * The Tainá Telegram bot publishes through a regular GainForest AI-agent key
 * (`gf_pat_…`) minted from the user's sign-in. The key is created with this
 * exact name so the Settings → AI agent keys list can recognise it and badge
 * it as the one linked to Tainá.
 */
export const TAINA_AGENT_KEY_NAME = "Tainá — Telegram bot";

export function isTainaAgentKeyName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === TAINA_AGENT_KEY_NAME;
}
