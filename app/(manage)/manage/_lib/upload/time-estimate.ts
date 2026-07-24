type UploadTimeMessageKey =
  | "fewSeconds"
  | "seconds"
  | "minutes"
  | "hours"
  | "hoursMinutes"
  | "done"
  | "completedIn"
  | "completed"
  | "estimating"
  | "calculating"
  | "left"
  | "saved";

type UploadTimeTranslate = (key: UploadTimeMessageKey, values?: Record<string, number | string>) => string;

export type UploadTimeEstimateInput = {
  startedAtMs: number | null;
  nowMs: number;
  completedUnits: number;
  totalUnits: number;
  isComplete: boolean;
  unitLabel: string;
  translate?: UploadTimeTranslate;
};

export type UploadTimeEstimate = {
  label: string;
  description: string;
};

const defaultTranslate: UploadTimeTranslate = (key, values = {}) => {
  switch (key) {
    case "fewSeconds": return "a few seconds";
    case "seconds": return `${values.count} sec`;
    case "minutes": return `${values.count} min`;
    case "hours": return `${values.count} hr`;
    case "hoursMinutes": return `${values.hours} hr ${values.minutes} min`;
    case "done": return "Done";
    case "completedIn": return `Completed in ${values.duration}`;
    case "completed": return "Completed";
    case "estimating": return "Estimating…";
    case "calculating": return "Calculating time remaining";
    case "left": return `~${values.duration} left`;
    case "saved": return `${values.completed} of ${values.total} ${values.unit} saved`;
  }
};

function formatDuration(ms: number, translate: UploadTimeTranslate): string {
  if (!Number.isFinite(ms) || ms <= 0) return translate("fewSeconds");
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 5) return translate("fewSeconds");
  if (totalSeconds < 60) return translate("seconds", { count: totalSeconds });
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return translate("minutes", { count: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? translate("hours", { count: hours })
    : translate("hoursMinutes", { hours, minutes });
}

export function getUploadTimeEstimate(input: UploadTimeEstimateInput): UploadTimeEstimate {
  const { startedAtMs, nowMs, completedUnits, totalUnits, isComplete, unitLabel } = input;
  const translate = input.translate ?? defaultTranslate;

  if (isComplete) {
    const elapsed = startedAtMs ? nowMs - startedAtMs : 0;
    return {
      label: translate("done"),
      description: elapsed > 0
        ? translate("completedIn", { duration: formatDuration(elapsed, translate) })
        : translate("completed"),
    };
  }

  if (!startedAtMs || completedUnits === 0) {
    return { label: translate("estimating"), description: translate("calculating") };
  }

  const elapsedMs = nowMs - startedAtMs;
  const msPerUnit = elapsedMs / completedUnits;
  const remainingUnits = totalUnits - completedUnits;
  const remainingMs = remainingUnits * msPerUnit;

  return {
    label: translate("left", { duration: formatDuration(remainingMs, translate) }),
    description: translate("saved", { completed: completedUnits, total: totalUnits, unit: unitLabel }),
  };
}
