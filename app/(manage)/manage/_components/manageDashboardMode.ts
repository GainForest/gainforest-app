import type { AccountKind } from "@/app/account/_lib/account-route";

export const MANAGE_MODE_VALUES = ["onboard", "onboard-user", "onboard-org"] as const;
export type ManageMode = (typeof MANAGE_MODE_VALUES)[number];

export function parseManageMode(value: string | string[] | undefined): ManageMode | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  switch (normalized) {
    case "onboard":
    case "onboard-user":
    case "onboard-org":
      return normalized;
    default:
      return null;
  }
}

export function resolveDashboardMode(options: {
  currentKind: AccountKind;
  mode: ManageMode | null;
}): ManageMode | null {
  if (options.currentKind === "organization" && (options.mode === "onboard" || options.mode === "onboard-user" || options.mode === "onboard-org")) {
    return null;
  }

  if (options.currentKind === "user" && options.mode === "onboard-user") {
    return null;
  }

  return options.mode;
}

export function shouldClearDashboardMode(options: {
  currentKind: AccountKind;
  rawMode: string | string[] | undefined;
}): boolean {
  if (options.rawMode === undefined) return false;
  const parsedMode = parseManageMode(options.rawMode);
  if (parsedMode === null) return true;
  return resolveDashboardMode({ currentKind: options.currentKind, mode: parsedMode }) === null;
}
