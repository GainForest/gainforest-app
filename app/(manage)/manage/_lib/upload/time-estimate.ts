export type UploadTimeEstimateInput = {
  startedAtMs: number | null;
  nowMs: number;
  completedUnits: number;
  totalUnits: number;
  isComplete: boolean;
  unitLabel: string;
};

export type UploadTimeEstimate = {
  label: string;
  description: string;
};

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "a few seconds";
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 5) return "a few seconds";
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function getUploadTimeEstimate(input: UploadTimeEstimateInput): UploadTimeEstimate {
  const { startedAtMs, nowMs, completedUnits, totalUnits, isComplete, unitLabel } = input;

  if (isComplete) {
    const elapsed = startedAtMs ? nowMs - startedAtMs : 0;
    return {
      label: "Done",
      description: elapsed > 0 ? `Completed in ${formatDuration(elapsed)}` : "Completed",
    };
  }

  if (!startedAtMs || completedUnits === 0) {
    return { label: "Estimating…", description: "Calculating time remaining" };
  }

  const elapsedMs = nowMs - startedAtMs;
  const msPerUnit = elapsedMs / completedUnits;
  const remainingUnits = totalUnits - completedUnits;
  const remainingMs = remainingUnits * msPerUnit;

  return {
    label: `~${formatDuration(remainingMs)} left`,
    description: `${completedUnits} of ${totalUnits} ${unitLabel}${totalUnits !== 1 ? "s" : ""} saved`,
  };
}
