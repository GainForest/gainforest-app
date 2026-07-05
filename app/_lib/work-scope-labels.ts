const KNOWN_WORK_SCOPE_KEYS = [
  "reforestation",
  "forest_protection",
  "biodiversity_monitoring",
  "community_stewardship",
  "carbon_removal",
  "restoration_maintenance",
] as const;

export type KnownWorkScopeKey = (typeof KNOWN_WORK_SCOPE_KEYS)[number];

const knownWorkScopeKeys = new Set<string>(KNOWN_WORK_SCOPE_KEYS);
const workScopeAliases: Record<string, KnownWorkScopeKey> = {
  nature_monitoring: "biodiversity_monitoring",
};

export const WORK_SCOPE_MESSAGE_KEYS: Record<KnownWorkScopeKey, string> = {
  reforestation: "reforestation",
  forest_protection: "forestProtection",
  biodiversity_monitoring: "natureMonitoring",
  community_stewardship: "communityStewardship",
  carbon_removal: "carbonRemoval",
  restoration_maintenance: "restorationMaintenance",
};

export type WorkScopeLabels = Record<KnownWorkScopeKey, string>;

export function normalizeKnownWorkScopeKey(value: string): KnownWorkScopeKey | null {
  const normalized = value.trim().replaceAll(/[_\s-]+/g, "_").toLowerCase();
  if (workScopeAliases[normalized]) return workScopeAliases[normalized];
  return knownWorkScopeKeys.has(normalized) ? normalized as KnownWorkScopeKey : null;
}

function formatUnknownWorkScopeTag(tag: string): string {
  const clean = tag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
}

export function formatWorkScopeTag(tag: string, labels: WorkScopeLabels): string {
  const knownKey = normalizeKnownWorkScopeKey(tag);
  return knownKey ? labels[knownKey] : formatUnknownWorkScopeTag(tag);
}

/**
 * Build the translated work-scope label map from a `common.workScopes`
 * translator. Mirrors the inline maps used on the Cert and project detail
 * pages so card components can format scope tags consistently.
 */
export function buildWorkScopeLabels(t: (key: string) => string): WorkScopeLabels {
  return {
    reforestation: t(WORK_SCOPE_MESSAGE_KEYS.reforestation),
    forest_protection: t(WORK_SCOPE_MESSAGE_KEYS.forest_protection),
    biodiversity_monitoring: t(WORK_SCOPE_MESSAGE_KEYS.biodiversity_monitoring),
    community_stewardship: t(WORK_SCOPE_MESSAGE_KEYS.community_stewardship),
    carbon_removal: t(WORK_SCOPE_MESSAGE_KEYS.carbon_removal),
    restoration_maintenance: t(WORK_SCOPE_MESSAGE_KEYS.restoration_maintenance),
  };
}
