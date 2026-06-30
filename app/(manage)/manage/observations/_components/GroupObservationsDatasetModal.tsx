"use client";

import { useMemo, useState } from "react";
import { CheckIcon, FolderPlusIcon, Layers2Icon, Loader2Icon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import type { ManageTarget } from "@/lib/links";
import type { OccurrenceRecord } from "@/app/_lib/indexer";
import {
  attachObservationsToDataset,
  createObservationDataset,
  type AttachObservationsResult,
} from "./observation-dataset-mutations";

export type ObservationDatasetGroup = {
  datasetUri: string;
  datasetRkey: string;
  name: string;
  description: string | null;
  count: number;
  createdAt: string | null;
  uris: string[];
};

export type GroupObservationsDoneSummary = {
  datasetUri: string;
  datasetName: string;
  result: AttachObservationsResult;
};

type Mode = "new" | "existing";

function datasetSearchText(dataset: ObservationDatasetGroup): string {
  return [dataset.name, dataset.description, String(dataset.count)]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function GroupObservationsDatasetModal({
  target,
  observations,
  datasets,
  onDone,
}: {
  target: ManageTarget;
  observations: OccurrenceRecord[];
  datasets: ObservationDatasetGroup[];
  onDone: (summary: GroupObservationsDoneSummary) => void;
}) {
  const t = useTranslations("upload.observations.dataset");
  const { hide, popModal, stack } = useModal();

  const selectableDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.datasetUri.length > 0 && dataset.datasetRkey.length > 0),
    [datasets],
  );
  const [mode, setMode] = useState<Mode>(selectableDatasets.length > 0 ? "existing" : "new");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedUri, setSelectedUri] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only orphan observations can join a dataset; ones already grouped are shown
  // as a hint so the count the steward sees lines up with what will move.
  const alreadyGrouped = useMemo(() => observations.filter((record) => Boolean(record.datasetRef)), [observations]);
  const movable = observations.length - alreadyGrouped.length;

  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;
  const filteredDatasets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return selectableDatasets;
    return selectableDatasets.filter((dataset) => datasetSearchText(dataset).includes(query));
  }, [search, selectableDatasets]);
  const selectedDataset = selectableDatasets.find((dataset) => dataset.datasetUri === selectedUri) ?? null;

  const closeModal = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
      return;
    }
    popModal();
  };

  const handleConfirm = async () => {
    if (movable === 0) {
      setError(t("allAlreadyGrouped"));
      return;
    }
    if (mode === "new" && name.trim().length === 0) {
      setError(t("nameRequired"));
      return;
    }
    if (mode === "existing" && !selectedDataset) {
      setError(t("pickDataset"));
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      const dataset =
        mode === "new"
          ? await createObservationDataset({ name, description }, repoOptions)
          : { uri: selectedDataset!.datasetUri, rkey: selectedDataset!.datasetRkey, name: selectedDataset!.name };

      const result = await attachObservationsToDataset(
        {
          datasetUri: dataset.uri,
          datasetRkey: dataset.rkey,
          datasetName: dataset.name,
          occurrences: observations.map((record) => ({ rkey: record.rkey, datasetRef: record.datasetRef })),
        },
        repoOptions,
      );

      if (result.attached.length === 0 && result.errors.length > 0) {
        setError(result.errors[0]?.error ?? t("attachFailed"));
        setIsPending(false);
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
      onDone({ datasetUri: dataset.uri, datasetName: dataset.name, result });
      await closeModal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("attachFailed"));
      setIsPending(false);
    }
  };

  const canToggle = selectableDatasets.length > 0;

  return (
    <ModalContent dismissible={!isPending}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <ModalTitle>{t("title", { count: movable })}</ModalTitle>
          <ModalDescription>{t("description")}</ModalDescription>
        </div>

        {canToggle ? (
          <div role="tablist" aria-label={t("modeLabel")} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "existing"}
              onClick={() => {
                setMode("existing");
                setError(null);
              }}
              disabled={isPending}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "existing" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers2Icon className="size-4" />
              {t("tabExisting")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "new"}
              onClick={() => {
                setMode("new");
                setError(null);
              }}
              disabled={isPending}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "new" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FolderPlusIcon className="size-4" />
              {t("tabNew")}
            </button>
          </div>
        ) : null}

        {mode === "new" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="observation-dataset-name" className="text-sm font-medium text-foreground">
                {t("nameLabel")}
              </label>
              <Input
                id="observation-dataset-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder={t("namePlaceholder")}
                disabled={isPending}
                autoFocus
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="observation-dataset-description" className="text-sm font-medium text-foreground">
                {t("descriptionLabel")}
              </label>
              <Textarea
                id="observation-dataset-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("descriptionPlaceholder")}
                disabled={isPending}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <label htmlFor="observation-dataset-search" className="sr-only">
                {t("searchLabel")}
              </label>
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="observation-dataset-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                disabled={isPending}
                className="pl-9"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              {filteredDatasets.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noMatches")}</div>
              ) : (
                <div role="radiogroup" aria-label={t("datasetsLabel")} className="divide-y divide-border">
                  {filteredDatasets.map((dataset) => {
                    const isSelected = selectedUri === dataset.datasetUri;
                    return (
                      <button
                        key={dataset.datasetUri}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setSelectedUri(dataset.datasetUri);
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
                            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        >
                          {isSelected ? <CheckIcon className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate text-sm font-medium text-foreground">{dataset.name}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Layers2Icon className="size-3" />
                            {t("datasetMeta", { count: dataset.count })}
                          </span>
                          {dataset.description ? (
                            <span className="line-clamp-2 block text-xs text-muted-foreground">{dataset.description}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {alreadyGrouped.length > 0 ? (
          <p className="text-xs text-muted-foreground">{t("someAlreadyGrouped", { count: alreadyGrouped.length })}</p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <ModalFooter className="mt-5">
        <Button variant="outline" onClick={() => void closeModal()} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={isPending || movable === 0}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <FolderPlusIcon className="size-4" />}
          {mode === "new" ? t("confirmNew") : t("confirmExisting")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

export default GroupObservationsDatasetModal;
