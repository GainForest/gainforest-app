/**
 * Which sightings a filtered observations view is allowed to show.
 *
 * `null` means "no filter — show everything", so it must never be the answer
 * while a project is in scope: that would quietly present every sighting the
 * account owns as if it belonged to the project.
 */

/** The sightings filed under the project in scope. Empty while the grouping is
 *  still loading or when the project has none yet — never `null`, which would
 *  read as "no filter". `null` only when no project is in scope at all. */
export function projectScopeUris(
  projectFilter: string | null | undefined,
  projectGroupUris: readonly string[] | null | undefined,
): ReadonlySet<string> | null {
  if (!projectFilter) return null;
  return new Set(projectGroupUris ?? []);
}

/** Combines the project scope with an open dataset. Inside a project a
 *  dataset can only ever show that project's share of it. */
export function resolveObservationFilterUris(
  projectUris: ReadonlySet<string> | null,
  datasetUris: readonly string[] | null | undefined,
): ReadonlySet<string> | null {
  if (!datasetUris) return projectUris;
  const inDataset = new Set(datasetUris);
  if (!projectUris) return inDataset;
  return new Set([...inDataset].filter((uri) => projectUris.has(uri)));
}
