type AttachmentSubjectInfo = { uri: string; cid: string };

type DatasetSiteOccurrenceInput = {
  datasetUri: string | null | undefined;
  siteRef: string | null | undefined;
};

type DatasetSiteLocationInput = {
  metadata: {
    uri: string;
    cid: string;
  };
  record: {
    name: string | null;
  };
};

export type DatasetSiteContext =
  | {
      status: "ready";
      siteSubject: AttachmentSubjectInfo;
      siteName: string | null;
    }
  | { status: "missing-site-ref" }
  | { status: "incomplete-site-ref"; siteRefs: string[] }
  | { status: "mixed-site-refs"; siteRefs: string[] }
  | { status: "unresolved-site"; siteRef: string };

export type DatasetSiteGroup = {
  siteSubject: AttachmentSubjectInfo;
  datasetUris: string[];
};

type SiteRefAccumulator = {
  siteRefs: Set<string>;
  missingCount: number;
};

function cleanRef(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function buildDatasetSiteContexts(args: {
  occurrences: DatasetSiteOccurrenceInput[];
  locations: DatasetSiteLocationInput[];
}): Map<string, DatasetSiteContext> {
  const siteRefsByDataset = new Map<string, SiteRefAccumulator>();

  for (const occurrence of args.occurrences) {
    const datasetUri = cleanRef(occurrence.datasetUri);
    if (!datasetUri) continue;

    const accumulator = siteRefsByDataset.get(datasetUri) ?? {
      siteRefs: new Set<string>(),
      missingCount: 0,
    };
    const siteRef = cleanRef(occurrence.siteRef);

    if (siteRef) {
      accumulator.siteRefs.add(siteRef);
    } else {
      accumulator.missingCount += 1;
    }

    siteRefsByDataset.set(datasetUri, accumulator);
  }

  const locationsByUri = new Map<string, DatasetSiteLocationInput>();
  for (const location of args.locations) {
    const locationUri = cleanRef(location.metadata.uri);
    if (locationUri) locationsByUri.set(locationUri, location);
  }

  const contexts = new Map<string, DatasetSiteContext>();

  for (const [datasetUri, accumulator] of siteRefsByDataset.entries()) {
    const siteRefs = Array.from(accumulator.siteRefs).sort();

    if (siteRefs.length === 0) {
      contexts.set(datasetUri, { status: "missing-site-ref" });
      continue;
    }

    if (siteRefs.length > 1) {
      contexts.set(datasetUri, { status: "mixed-site-refs", siteRefs });
      continue;
    }

    const siteRef = siteRefs[0]!;
    if (accumulator.missingCount > 0) {
      contexts.set(datasetUri, { status: "incomplete-site-ref", siteRefs });
      continue;
    }

    const location = locationsByUri.get(siteRef);
    if (!location) {
      contexts.set(datasetUri, { status: "unresolved-site", siteRef });
      continue;
    }

    contexts.set(datasetUri, {
      status: "ready",
      siteSubject: { uri: siteRef, cid: location.metadata.cid },
      siteName: location.record.name,
    });
  }

  return contexts;
}

export function getDatasetSiteContext(
  contexts: Map<string, DatasetSiteContext>,
  datasetUri: string,
): DatasetSiteContext {
  const normalizedDatasetUri = cleanRef(datasetUri);
  return normalizedDatasetUri
    ? contexts.get(normalizedDatasetUri) ?? { status: "missing-site-ref" }
    : { status: "missing-site-ref" };
}

export function groupDatasetUrisBySite(args: {
  datasetUris: string[];
  contexts: Map<string, DatasetSiteContext>;
}): DatasetSiteGroup[] {
  const groupsBySiteUri = new Map<string, DatasetSiteGroup>();

  for (const datasetUri of args.datasetUris) {
    const normalizedDatasetUri = cleanRef(datasetUri);
    if (!normalizedDatasetUri) continue;

    const context = getDatasetSiteContext(args.contexts, normalizedDatasetUri);
    if (context.status !== "ready") continue;

    const group = groupsBySiteUri.get(context.siteSubject.uri) ?? {
      siteSubject: context.siteSubject,
      datasetUris: [],
    };
    group.datasetUris.push(normalizedDatasetUri);
    groupsBySiteUri.set(context.siteSubject.uri, group);
  }

  return Array.from(groupsBySiteUri.values());
}
