"use client";

import { getRecord, putRecord } from "../../_lib/mutations";
import { nestDatasetUnderProject } from "./observation-dataset-mutations";

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
};

/**
 * File a whole dataset under a project: the project lists the dataset record,
 * and every observation in it gets the project's `projectRef`.
 *
 * Both halves matter. The listing is the record-level relationship; the
 * per-observation stamp is what every count, gallery and filter reads, so
 * without it the folder would look attached while its sightings stayed
 * invisible to the project.
 */
export async function attachDatasetToProject(
  input: {
    projectUri: string;
    siteUri?: string | null;
    datasetUri: string;
    datasetCid?: string | null;
    occurrences: ProjectAttachInput[];
  },
  options?: RepoOptions,
): Promise<AttachDatasetToProjectResult> {
  let nested = true;
  let nestError: string | null = null;
  try {
    await nestDatasetUnderProject(
      { projectUri: input.projectUri, datasetUri: input.datasetUri, datasetCid: input.datasetCid },
      options,
    );
  } catch (error) {
    nested = false;
    nestError = error instanceof Error ? error.message : "The folder could not be listed on the project.";
  }

  const result = await attachObservationsToProject(
    { projectUri: input.projectUri, siteUri: input.siteUri, occurrences: input.occurrences },
    options,
  );

  return { ...result, nested, nestError };
}
