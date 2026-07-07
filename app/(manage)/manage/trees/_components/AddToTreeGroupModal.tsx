"use client";

import { useMemo, useState } from "react";
import { CheckIcon, DatabaseIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useIsDrawer, useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import type { UploadTreeDatasetRecord } from "@/app/_lib/indexer";

type AddToTreeGroupModalProps = {
  treeGroups: UploadTreeDatasetRecord[];
  treeCount: number;
  onConfirm: (treeGroup: UploadTreeDatasetRecord) => Promise<void>;
};

function formatTreeGroupDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTreeGroupMeta(treeGroup: UploadTreeDatasetRecord): string {
  const count = treeGroup.recordCount ?? 0;
  const createdAt = formatTreeGroupDate(treeGroup.createdAt);
  return `${count} tree${count === 1 ? "" : "s"}${createdAt ? ` · Created ${createdAt}` : ""}`;
}

function getTreeGroupSearchText(treeGroup: UploadTreeDatasetRecord): string {
  return [
    treeGroup.name,
    treeGroup.description,
    treeGroup.recordCount?.toString(),
    treeGroup.createdAt,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function AddToTreeGroupModal({
  treeGroups,
  treeCount,
  onConfirm,
}: AddToTreeGroupModalProps) {
  const { hide, popModal, stack } = useModal();
  // In drawer mode the whole sheet scrolls; releasing the list's own scroll
  // keeps the Cancel/Add footer reachable on touch.
  const isDrawer = useIsDrawer();
  const selectableTreeGroups = useMemo(
    () => treeGroups.filter((treeGroup) => treeGroup.rkey.length > 0 && treeGroup.uri.length > 0),
    [treeGroups],
  );
  const [selectedTreeGroupUri, setSelectedTreeGroupUri] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filteredTreeGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return selectableTreeGroups;
    return selectableTreeGroups.filter((treeGroup) => getTreeGroupSearchText(treeGroup).includes(query));
  }, [searchQuery, selectableTreeGroups]);
  const selectedTreeGroup = selectableTreeGroups.find((treeGroup) => treeGroup.uri === selectedTreeGroupUri) ?? null;
  const treeLabel = treeCount === 1 ? "tree" : "trees";

  const handleClose = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
      return;
    }
    popModal();
  };

  const handleConfirm = async () => {
    if (!selectedTreeGroup) {
      setError("Choose a tree group before continuing.");
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      await onConfirm(selectedTreeGroup);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trees could not be added.");
      setIsPending(false);
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
    await handleClose();
  };

  return (
    <ModalContent dismissible={!isPending}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <ModalTitle>
            {treeCount === 1 ? "Add 1 tree to a tree group" : `Add ${treeCount} trees to a tree group`}
          </ModalTitle>
          <ModalDescription>
            {treeCount === 1
              ? `Choose which tree group to add this ${treeLabel} to.`
              : `Choose which tree group to add these ${treeCount} ${treeLabel} to.`}
          </ModalDescription>
        </div>

        {selectableTreeGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Create a tree group during tree upload before adding ungrouped trees to it.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <label htmlFor="tree-group-picker-search" className="sr-only">
                Search tree groups
              </label>
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tree-group-picker-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search tree groups..."
                disabled={isPending}
                className="pl-9"
              />
            </div>

            <div className={cn("rounded-xl border border-border", !isDrawer && "max-h-72 overflow-y-auto")}>
              {filteredTreeGroups.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No tree groups match your search.
                </div>
              ) : (
                <div role="radiogroup" aria-label="Tree groups" className="divide-y divide-border">
                  {filteredTreeGroups.map((treeGroup) => {
                    const isSelected = selectedTreeGroupUri === treeGroup.uri;
                    return (
                      <button
                        key={treeGroup.uri}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setSelectedTreeGroupUri(treeGroup.uri);
                          setError(null);
                        }}
                        disabled={isPending}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 disabled:cursor-not-allowed disabled:opacity-60",
                          isSelected ? "bg-primary/5" : "bg-background",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        >
                          {isSelected ? <CheckIcon className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {treeGroup.name || "Unnamed tree group"}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <DatabaseIcon className="size-3" />
                            {formatTreeGroupMeta(treeGroup)}
                          </span>
                          {treeGroup.description ? (
                            <span className="line-clamp-2 block text-xs text-muted-foreground">
                              {treeGroup.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedTreeGroup ? (
              <p className="text-xs text-muted-foreground">
                {treeCount} {treeLabel} will be added to{" "}
                <span className="font-medium text-foreground">
                  {selectedTreeGroup.name || "the selected tree group"}
                </span>
                .
              </p>
            ) : null}
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <ModalFooter className="mt-5">
        <Button variant="outline" onClick={() => void handleClose()} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={isPending || selectableTreeGroups.length === 0 || !selectedTreeGroup}>
          {isPending ? <Loader2Icon className="animate-spin" /> : null}
          Add to tree group
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

export default AddToTreeGroupModal;
