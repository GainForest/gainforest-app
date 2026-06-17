import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarIcon,
  ChevronRightIcon,
  DatabaseIcon,
  MapPinIcon,
  Trash2Icon,
  TreesIcon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploadTreeDatasetRecord } from "@/app/_lib/indexer";
import {
  formatTreeSubtitle,
  hasAnyMeasurementValue,
  getTreeMeasurementDraft,
  type TreeManagerItem,
} from "./tree-manager-utils";

export const UNGROUPED_DATASET_FILTER = "__ungrouped__";

type StatusTone = "neutral" | "good" | "warn";

export type DatasetLandingBuildCopy = {
  dateUnavailable: string;
  locationNotSet: string;
  additionalLocations: (count: number) => string;
  ungroupedTrees: string;
  unnamedTreeGroup: string;
  statusNoTrees: string;
  statusNeedsCleanup: string;
  statusMigrationNeeded: string;
  statusMeasurementsReady: string;
  statusPartlyMeasured: string;
  statusNoMeasurements: string;
};

export type DatasetLandingBuildOptions = {
  locale: string;
  copy: DatasetLandingBuildCopy;
};

export type DatasetLandingCard = {
  id: string;
  name: string;
  treeCount: number;
  uploadDateLabel: string;
  uploadTimestamp: number;
  locationLabel: string;
  recordedByValues: string[];
  statusLabel: string;
  statusTone: StatusTone;
  searchText: string;
  isUngrouped: boolean;
  canDelete: boolean;
};

function formatUploadDate(value: string | null | undefined, options: DatasetLandingBuildOptions): string {
  if (!value) return options.copy.dateUnavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return options.copy.dateUnavailable;
  return date.toLocaleDateString(options.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getUploadTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getLatestTimestampValue(values: Array<string | null | undefined>): string | null {
  let latestTimestamp = 0;
  let latestValue: string | null = null;

  for (const value of values) {
    const timestamp = getUploadTimestamp(value);
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestValue = value ?? null;
    }
  }

  return latestValue;
}

function getLatestTreeCreatedAt(trees: TreeManagerItem[]): string | null {
  return getLatestTimestampValue(trees.map((tree) => tree.occurrence.createdAt));
}

function getTreeGroupLocationLabel(trees: TreeManagerItem[], copy: DatasetLandingBuildCopy): string {
  const uniqueLocations = Array.from(
    new Set(
      trees
        .map((tree) => formatTreeSubtitle(tree))
        .filter((value) => value !== "Location not set"),
    ),
  );

  if (uniqueLocations.length === 0) return copy.locationNotSet;
  if (uniqueLocations.length === 1) return uniqueLocations[0] ?? copy.locationNotSet;
  return `${uniqueLocations[0]} ${copy.additionalLocations(uniqueLocations.length - 1)}`;
}

function getTreeGroupRecordedByValues(trees: TreeManagerItem[]): string[] {
  const values = new Map<string, string>();

  for (const tree of trees) {
    const recordedBy = tree.occurrence.recordedBy?.trim();
    if (!recordedBy) continue;
    const key = recordedBy.toLowerCase();
    if (!values.has(key)) values.set(key, recordedBy);
  }

  return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
}

export function getSafeRecordedByDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (/^(\/\/|www\.)/i.test(trimmed)) return null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  if (!trimmed.includes(" ") && /^@?[a-z0-9._-]+\.[a-z]{2,}$/i.test(trimmed)) return null;
  return trimmed;
}

function formatRecordedByLabel(values: string[], options: { fallback: string; multiple: (count: number) => string; firstAndMore: (name: string, count: number) => string }): string | null {
  if (values.length === 0) return null;
  const displayValues = values.map(getSafeRecordedByDisplayName).filter((value): value is string => Boolean(value));
  if (displayValues.length === 0) return values.length === 1 ? options.fallback : options.multiple(values.length);
  if (values.length === 1) return displayValues[0] ?? options.fallback;
  return options.firstAndMore(displayValues[0] ?? options.fallback, values.length - 1);
}

function getTreeGroupStatus(trees: TreeManagerItem[], copy: DatasetLandingBuildCopy): { label: string; tone: StatusTone } {
  if (trees.length === 0) return { label: copy.statusNoTrees, tone: "neutral" };

  if (trees.some((tree) => tree.hasDuplicateBundledMeasurements)) {
    return { label: copy.statusNeedsCleanup, tone: "warn" };
  }

  if (trees.some((tree) => tree.hasLegacyMeasurements || tree.hasUnsupportedMeasurements)) {
    return { label: copy.statusMigrationNeeded, tone: "warn" };
  }

  const measuredCount = trees.filter((tree) => hasAnyMeasurementValue(getTreeMeasurementDraft(tree.floraMeasurement))).length;

  if (measuredCount === trees.length) return { label: copy.statusMeasurementsReady, tone: "good" };
  if (measuredCount > 0) return { label: copy.statusPartlyMeasured, tone: "neutral" };
  return { label: copy.statusNoMeasurements, tone: "neutral" };
}

function createTreeGroupLandingCard(options: {
  id: string;
  treeGroup: UploadTreeDatasetRecord | null;
  trees: TreeManagerItem[];
  isUngrouped: boolean;
  buildOptions: DatasetLandingBuildOptions;
}): DatasetLandingCard {
  const { id, treeGroup, trees, isUngrouped, buildOptions } = options;
  const copy = buildOptions.copy;
  const createdAt = treeGroup?.createdAt ?? getLatestTreeCreatedAt(trees);
  const treeCount = Math.max(trees.length, treeGroup?.recordCount ?? 0);
  const { label: statusLabel, tone: statusTone } = getTreeGroupStatus(trees, copy);
  const name = isUngrouped ? copy.ungroupedTrees : treeGroup?.name ?? copy.unnamedTreeGroup;
  const locationLabel = getTreeGroupLocationLabel(trees, copy);
  const recordedByValues = getTreeGroupRecordedByValues(trees);
  const searchableRecordedByValues = recordedByValues.map(getSafeRecordedByDisplayName).filter((value): value is string => Boolean(value));
  const uploadDateLabel = formatUploadDate(createdAt, buildOptions);
  const searchText = [
    name,
    treeGroup?.description,
    `${treeCount}`,
    locationLabel,
    searchableRecordedByValues.join(" "),
    statusLabel,
    uploadDateLabel,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return {
    id,
    name,
    treeCount,
    uploadDateLabel,
    uploadTimestamp: getUploadTimestamp(createdAt),
    locationLabel,
    recordedByValues,
    statusLabel,
    statusTone,
    searchText,
    isUngrouped,
    canDelete: !isUngrouped && treeGroup !== null,
  };
}

export function buildDatasetLandingCards(
  treeGroups: UploadTreeDatasetRecord[],
  trees: TreeManagerItem[],
  buildOptions: DatasetLandingBuildOptions,
): DatasetLandingCard[] {
  const treesByGroup = new Map<string, TreeManagerItem[]>();

  for (const tree of trees) {
    const groupRef = tree.occurrence.datasetRef;
    const key = typeof groupRef === "string" && groupRef.length > 0 ? groupRef : UNGROUPED_DATASET_FILTER;
    const existing = treesByGroup.get(key) ?? [];
    existing.push(tree);
    treesByGroup.set(key, existing);
  }

  const cards = new Map<string, DatasetLandingCard>();

  for (const treeGroup of treeGroups) {
    cards.set(
      treeGroup.uri,
      createTreeGroupLandingCard({
        id: treeGroup.uri,
        treeGroup,
        trees: treesByGroup.get(treeGroup.uri) ?? [],
        isUngrouped: false,
        buildOptions,
      }),
    );
  }

  for (const [id, groupedTrees] of treesByGroup) {
    if (cards.has(id)) continue;
    cards.set(
      id,
      createTreeGroupLandingCard({
        id,
        treeGroup: null,
        trees: groupedTrees,
        isUngrouped: id === UNGROUPED_DATASET_FILTER,
        buildOptions,
      }),
    );
  }

  return [...cards.values()].sort((left, right) => {
    if (left.isUngrouped !== right.isUngrouped) return left.isUngrouped ? -1 : 1;
    if (right.uploadTimestamp !== left.uploadTimestamp) return right.uploadTimestamp - left.uploadTimestamp;
    if (right.treeCount !== left.treeCount) return right.treeCount - left.treeCount;
    return left.name.localeCompare(right.name);
  });
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "good" && "border-primary/25 bg-primary/5 text-primary",
        tone === "warn" && "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
        tone === "neutral" && "border-border bg-background text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function DatasetLandingSection({
  datasetCards,
  onOpen,
  onDelete,
  deleteDisabledReason = null,
}: {
  datasetCards: DatasetLandingCard[];
  onOpen: (treeGroupId: string) => void;
  onDelete?: (treeGroupId: string) => void;
  deleteDisabledReason?: string | null;
}) {
  const t = useTranslations("common.manageTrees.datasetLanding");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {datasetCards.map((card) => {
        const recordedByLabel = formatRecordedByLabel(card.recordedByValues, {
          fallback: t("recorderFallback"),
          multiple: (count) => t("multipleRecorders", { count }),
          firstAndMore: (name, count) => t("firstRecorderAndMore", { name, count }),
        });

        return (
        <article
          key={card.id}
          className={cn(
            "group flex h-full flex-col rounded-2xl border border-border bg-background p-5 text-left transition-all",
            "hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-sm",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {card.isUngrouped ? t("needsTreeGroup") : t("treeGroup")}
              </p>
              <h2 className="truncate text-2xl leading-none text-foreground font-garamond">
                {card.name}
              </h2>
            </div>
            <StatusBadge tone={card.statusTone}>{card.statusLabel}</StatusBadge>
          </div>

          <div className="mt-5 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <TreesIcon className="size-4 shrink-0" />
              <span>{t("treeCount", { count: card.treeCount })}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 shrink-0" />
              <span>{card.uploadDateLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPinIcon className="size-4 shrink-0" />
              <span className="truncate">{card.locationLabel}</span>
            </div>
            {recordedByLabel ? (
              <div className="flex items-center gap-2">
                <UserRoundIcon className="size-4 shrink-0" />
                <span className="truncate">{t("recordedBy", { name: recordedByLabel })}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4 text-sm font-medium text-foreground">
            <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => onOpen(card.id)}>
              <DatabaseIcon className="size-4 text-muted-foreground" />
              {t("openTreeGroup")}
              <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Button>
            {card.canDelete && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(card.id)}
                disabled={Boolean(deleteDisabledReason)}
                title={deleteDisabledReason ?? undefined}
                aria-label={t("deleteTreeGroupNamed", { name: card.name })}
              >
                <Trash2Icon />
                {t("deleteTreeGroup")}
              </Button>
            ) : null}
          </div>
        </article>
        );
      })}
    </div>
  );
}
