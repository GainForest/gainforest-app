"use client";

/**
 * Where an SD-card batch lands when its recordings carry no deployment the
 * app recognises: a folder the account already has (an `ac.deployment`, the
 * thing that groups recordings on a profile) or a new one named here.
 *
 * Adding to an existing folder is the default — repeated uploads from the
 * same site used to scatter across one-off folders, because naming a new one
 * was the only option.
 */

import { useTranslations } from "next-intl";
import { CheckIcon, FolderIcon, FolderPlusIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  activeUploadFolderMode,
  filterUploadFolders,
  type UploadFolderMode,
} from "@/app/_lib/audiomoth/upload-folder";

export type UploadFolderOptionItem = {
  uri: string;
  name: string;
  /** ISO date the recorder was deployed, shown as the folder's date. */
  deployedAt?: string;
};

export function UploadFolderPicker({
  /** null while the account's folders are still loading. */
  folders,
  /** Recordings already in each folder, keyed by folder AT-URI. */
  counts,
  mode,
  onModeChange,
  selectedUri,
  onSelect,
  query,
  onQueryChange,
  newName,
  onNewNameChange,
  resumed = false,
}: {
  folders: UploadFolderOptionItem[] | null;
  counts: Map<string, number>;
  mode: UploadFolderMode;
  onModeChange: (mode: UploadFolderMode) => void;
  selectedUri: string;
  onSelect: (uri: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  newName: string;
  onNewNameChange: (name: string) => void;
  /** The selected folder was matched to this card, not chosen by hand. */
  resumed?: boolean;
}) {
  const t = useTranslations("common.audiomoth.upload");

  const hasFolders = (folders?.length ?? 0) > 0;
  const activeMode = activeUploadFolderMode(mode, folders?.length ?? 0);
  const filtered = filterUploadFolders(folders ?? [], query, selectedUri);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/90 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("folderTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activeMode === "existing"
              ? resumed && selectedUri
                ? t("folderResumedHelp")
                : t("folderExistingHelp")
              : t("groupNameHelp")}
          </p>
        </div>
        {hasFolders ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onModeChange(activeMode === "existing" ? "new" : "existing")}
          >
            {activeMode === "existing" ? (
              <>
                <FolderPlusIcon className="size-4" />
                {t("folderNewAction")}
              </>
            ) : (
              <>
                <FolderIcon className="size-4" />
                {t("folderExistingAction")}
              </>
            )}
          </Button>
        ) : null}
      </div>

      {folders === null ? (
        <div className="flex items-center gap-2 px-0.5 py-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
          {t("folderLoading")}
        </div>
      ) : activeMode === "existing" ? (
        <div className="flex flex-col gap-2">
          {folders.length > 6 ? (
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("folderSearchPlaceholder")}
              className="sm:max-w-sm"
            />
          ) : null}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{t("folderNoMatch")}</p>
            ) : (
              filtered.map((folder) => {
                const selected = folder.uri === selectedUri;
                const count = counts.get(folder.uri) ?? 0;
                return (
                  <button
                    key={folder.uri}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(selected ? "" : folder.uri)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-0",
                      selected
                        ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {selected ? <CheckIcon className="size-4" /> : <FolderIcon className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{folder.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {[
                          folder.deployedAt ? new Date(folder.deployedAt).toLocaleDateString() : null,
                          count > 0 ? t("groupCount", { count }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <>
          <Label htmlFor="upload-group-name" className="sr-only">
            {t("groupNameLabel")}
          </Label>
          <Input
            id="upload-group-name"
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            placeholder={t("groupNamePlaceholder")}
            maxLength={120}
            className="sm:max-w-sm"
          />
        </>
      )}
    </div>
  );
}
