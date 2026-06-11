import {
  CalendarIcon,
  ChevronRightIcon,
  DatabaseIcon,
  MapPinIcon,
  TreesIcon,
} from "lucide-react";
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

export type DatasetLandingCard = {
  id: string;
  name: string;
  treeCount: number;
  uploadDateLabel: string;
  uploadTimestamp: number;
  locationLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  searchText: string;
  isUngrouped: boolean;
};

function formatUploadDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-US", {
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

function getTreeGroupLocationLabel(trees: TreeManagerItem[]): string {
  const uniqueLocations = Array.from(
    new Set(
      trees
        .map((tree) => formatTreeSubtitle(tree))
        .filter((value) => value !== "Location not set"),
    ),
  );

  if (uniqueLocations.length === 0) return "Location not set";
  if (uniqueLocations.length === 1) return uniqueLocations[0] ?? "Location not set";
  return `${uniqueLocations[0]} + ${uniqueLocations.length - 1} more`;
}

function getTreeGroupStatus(trees: TreeManagerItem[]): { label: string; tone: StatusTone } {
  if (trees.length === 0) return { label: "No trees yet", tone: "neutral" };

  if (trees.some((tree) => tree.hasDuplicateBundledMeasurements)) {
    return { label: "Needs cleanup", tone: "warn" };
  }

  if (trees.some((tree) => tree.hasLegacyMeasurements || tree.hasUnsupportedMeasurements)) {
    return { label: "Migration needed", tone: "warn" };
  }

  const measuredCount = trees.filter((tree) => hasAnyMeasurementValue(getTreeMeasurementDraft(tree.floraMeasurement))).length;

  if (measuredCount === trees.length) return { label: "Measurements ready", tone: "good" };
  if (measuredCount > 0) return { label: "Partly measured", tone: "neutral" };
  return { label: "No measurements yet", tone: "neutral" };
}

function createTreeGroupLandingCard(options: {
  id: string;
  treeGroup: UploadTreeDatasetRecord | null;
  trees: TreeManagerItem[];
  isUngrouped: boolean;
}): DatasetLandingCard {
  const { id, treeGroup, trees, isUngrouped } = options;
  const createdAt = treeGroup?.createdAt ?? getLatestTreeCreatedAt(trees);
  const treeCount = Math.max(trees.length, treeGroup?.recordCount ?? 0);
  const { label: statusLabel, tone: statusTone } = getTreeGroupStatus(trees);
  const name = isUngrouped ? "Ungrouped trees" : treeGroup?.name ?? "Unnamed tree group";
  const locationLabel = getTreeGroupLocationLabel(trees);
  const uploadDateLabel = formatUploadDate(createdAt);
  const searchText = [
    name,
    treeGroup?.description,
    `${treeCount}`,
    locationLabel,
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
    statusLabel,
    statusTone,
    searchText,
    isUngrouped,
  };
}

export function buildDatasetLandingCards(
  treeGroups: UploadTreeDatasetRecord[],
  trees: TreeManagerItem[],
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

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
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
}: {
  datasetCards: DatasetLandingCard[];
  onOpen: (treeGroupId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {datasetCards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onOpen(card.id)}
          className={cn(
            "group flex h-full flex-col rounded-2xl border border-border bg-background p-5 text-left transition-all",
            "hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {card.isUngrouped ? "Needs a tree group" : "Tree group"}
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
              <span>
                {card.treeCount} tree{card.treeCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 shrink-0" />
              <span>{card.uploadDateLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPinIcon className="size-4 shrink-0" />
              <span className="truncate">{card.locationLabel}</span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4 text-sm font-medium text-foreground">
            <span className="inline-flex items-center gap-2">
              <DatabaseIcon className="size-4 text-muted-foreground" />
              Open tree group
            </span>
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>
      ))}
    </div>
  );
}
