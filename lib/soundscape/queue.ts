/**
 * Analysis queue state for the soundscape tab — kept pure (no React, no DOM)
 * so the retry/progress accounting can be unit tested. The UI in
 * app/soundscape/_components/SoundscapeClient.tsx owns the actual state.
 */

export type AnalysisStatus = "idle" | "queued" | "downloading" | "analyzing" | "done" | "error";

/** Why a recording failed. `tooShort` is deterministic; the others are transient. */
export type AnalysisErrorKind = "download" | "decode" | "tooShort";

export type AnalysisState = {
  status: AnalysisStatus;
  pmn?: number[];
  errorKind?: AnalysisErrorKind;
};

/**
 * Whether a recording is still worth (re)queuing.
 *
 * Missing state means it was never touched, so it counts as pending. A
 * "too short" failure is deterministic — the file will never be long enough
 * for the PMN pipeline's minimum — so it must not inflate the retry count,
 * otherwise the Analyze button keeps offering work that can never succeed.
 */
export function isRetryable(state: AnalysisState | undefined): boolean {
  if (!state || state.status === "idle") return true;
  return state.status === "error" && state.errorKind !== "tooShort";
}

/**
 * Whether a recording is still on the conveyor belt — queued, downloading or
 * analyzing. This is the work a pause suspends and a resume carries on with,
 * so it drives both the "Resume N recordings" count and whether the queue
 * controls are shown at all.
 *
 * Deliberately distinct from `isRetryable`: an idle or failed recording needs
 * the Analyze button to put it back in the queue, it is not outstanding work.
 */
export function isOutstanding(state: AnalysisState | undefined): boolean {
  return state?.status === "queued" || state?.status === "downloading" || state?.status === "analyzing";
}
