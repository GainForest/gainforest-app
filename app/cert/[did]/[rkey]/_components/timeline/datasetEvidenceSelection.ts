import {
  getDatasetSiteContext,
  type DatasetSiteContext,
} from "./datasetSiteContext";

export type DatasetSelectionDisabledReason =
  | "checking-existing-links"
  | "unable-to-verify-existing-links"
  | "unable-to-verify-site-context"
  | "already-linked"
  | "missing-site-ref"
  | "incomplete-site-ref"
  | "mixed-site-refs"
  | "unresolved-site";

type DatasetSelectionRow = {
  uri: string;
};

export function getTreeDatasetSelectionState(args: {
  uri: string;
  siteContext: DatasetSiteContext;
  linkedDatasetUris: ReadonlySet<string>;
  timelineAttachmentsLoading?: boolean;
  timelineAttachmentsUnavailable?: boolean;
  siteContextsUnavailable?: boolean;
}): { canSelect: boolean; disabledReason: DatasetSelectionDisabledReason | null } {
  if (args.timelineAttachmentsLoading) {
    return { canSelect: false, disabledReason: "checking-existing-links" };
  }

  if (args.timelineAttachmentsUnavailable) {
    return { canSelect: false, disabledReason: "unable-to-verify-existing-links" };
  }

  if (args.linkedDatasetUris.has(args.uri)) {
    return { canSelect: false, disabledReason: "already-linked" };
  }

  if (args.siteContextsUnavailable) {
    return { canSelect: false, disabledReason: "unable-to-verify-site-context" };
  }

  if (args.siteContext.status !== "ready") {
    return { canSelect: false, disabledReason: args.siteContext.status };
  }

  return { canSelect: true, disabledReason: null };
}

export function buildSelectableTreeDatasetUris(args: {
  rows: DatasetSelectionRow[];
  siteContextsByDataset: Map<string, DatasetSiteContext>;
  linkedDatasetUris: ReadonlySet<string>;
  timelineAttachmentsLoading?: boolean;
  timelineAttachmentsUnavailable?: boolean;
  siteContextsUnavailable?: boolean;
}): Set<string> {
  const selectableUris = new Set<string>();

  for (const row of args.rows) {
    const siteContext = getDatasetSiteContext(
      args.siteContextsByDataset,
      row.uri,
    );
    const selectionState = getTreeDatasetSelectionState({
      uri: row.uri,
      siteContext,
      linkedDatasetUris: args.linkedDatasetUris,
      timelineAttachmentsLoading: args.timelineAttachmentsLoading,
      timelineAttachmentsUnavailable: args.timelineAttachmentsUnavailable,
      siteContextsUnavailable: args.siteContextsUnavailable,
    });

    if (selectionState.canSelect) selectableUris.add(row.uri);
  }

  return selectableUris;
}
