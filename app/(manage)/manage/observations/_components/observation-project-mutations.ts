"use client";

import { getRecord, putRecord } from "../../_lib/mutations";
import { setDatasetProject } from "./observation-dataset-mutations";

// An observation belongs to a project when it carries the project's AT-URI in
// `projectRef` — the same field the add flows write. Filing an already-published
// observation is therefore a read-modify-write of that one field.
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

type RepoOptions = { repo?: string } | undefined;

export type ProjectAttachInput = {
  /** Record key of the occurrence to file. */
  rkey: string;
  /** Project the occurrence already belongs to, if any. */
  projectRef: string | null;
  /** Site the occurrence was recorded at, if any. Left alone when set. */
  siteRef: string | null;
};

export type AttachToProjectResult = {
  attached: string[];
  /** Already filed under this project — left untouched. */
  skipped: string[];
  errors: Array<{ rkey: string; error: string }>;
};

/**
 * File observations under a project by stamping `projectRef` onto each one (a
 * read-modify-write that preserves everything else, including photo evidence
 * and dataset membership).
 *
 * Moving between projects is allowed — unlike dataset membership, a project is
 * a claim about what the work belongs to and stewards need to correct it. The
 * project's site is only filled in when the observation has none, so a sighting
 * recorded at a specific place never has its location rewritten.
 */
export async function attachObservationsToProject(
  input: {
    projectUri: string;
    /** The project's mapped site, when it has one. */
    siteUri?: string | null;
    occurrences: ProjectAttachInput[];
  },
  options?: RepoOptions,
): Promise<AttachToProjectResult> {
  const attached: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ rkey: string; error: string }> = [];

  for (const occurrence of input.occurrences) {
    if (occurrence.projectRef === input.projectUri) {
      skipped.push(occurrence.rkey);
      continue;
    }
    try {
      const current = await getRecord(OCCURRENCE_COLLECTION, occurrence.rkey, options);
      const keepsOwnSite = typeof current.record.siteRef === "string" && current.record.siteRef.trim().length > 0;
      const nextRecord: Record<string, unknown> = {
        ...current.record,
        $type: typeof current.record.$type === "string" ? current.record.$type : OCCURRENCE_COLLECTION,
        projectRef: input.projectUri,
        ...(input.siteUri && !keepsOwnSite ? { siteRef: input.siteUri } : {}),
      };
      await putRecord(OCCURRENCE_COLLECTION, occurrence.rkey, nextRecord, {
        swapRecord: current.cid,
        ...(options?.repo ? { repo: options.repo } : {}),
      });
      attached.push(occurrence.rkey);
    } catch (error) {
      errors.push({
        rkey: occurrence.rkey,
        error: error instanceof Error ? error.message : "This observation could not be added to the project.",
      });
    }
  }

  return { attached, skipped, errors };
}

export type AttachDatasetToProjectResult = AttachToProjectResult & {
  /** False when the dataset record itself could not be listed on the project. */
  nested: boolean;
  nestError: string | null;
  /** Projects the dataset was removed from, because it moved here. */
  unnestedFrom: string[];
  /** Previous projects that could not be updated after the dataset was nested. */
  unnestErrors: Array<{ rkey: string; error: string }>;
};

/**
 * File a whole dataset under a project: the project lists the dataset record,
 * and every observation in it gets the project's `projectRef`.
 *
 * Both halves matter. The listing is the record-level relationship; the
 * per-observation stamp is what every count, gallery and filter reads, so
 * without it the dataset would look attached while its sightings stayed
 * invisible to the project.
 *
 * A dataset lives in ONE project. Two projects could each list it in `items[]`,
 * but a sighting names a single project in `projectRef` — so a shared dataset
 * would show up under both while its sightings counted for only the last one.
 * Filing therefore moves the dataset: it is unlisted from its previous project.
 */
export async function attachDatasetToProject(
  input: {
    projectUri: string;
    siteUri?: string | null;
    datasetUri: string;
    datasetCid?: string | null;
    /** Projects currently listing this dataset; all but the target are dropped. */
    parentRkeys?: string[];
    occurrences: ProjectAttachInput[];
  },
  options?: RepoOptions,
): Promise<AttachDatasetToProjectResult> {
  const datasetMove = await setDatasetProject(
    {
      projectUri: input.projectUri,
      datasetUri: input.datasetUri,
      datasetCid: input.datasetCid,
      currentParentRkeys: input.parentRkeys ?? [],
    },
    options,
  );
  if (datasetMove.nestError) {
    return {
      attached: [],
      skipped: [],
      errors: [],
      nested: false,
      nestError: datasetMove.nestError,
      unnestedFrom: [],
      unnestErrors: [],
    };
  }

  const result = await attachObservationsToProject(
    { projectUri: input.projectUri, siteUri: input.siteUri, occurrences: input.occurrences },
    options,
  );

  return {
    ...result,
    nested: datasetMove.nested,
    nestError: null,
    unnestedFrom: datasetMove.unnestedFrom,
    unnestErrors: datasetMove.unnestErrors,
  };
}
