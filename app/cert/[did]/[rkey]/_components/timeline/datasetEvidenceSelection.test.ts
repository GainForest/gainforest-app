import { describe, expect, it } from "vitest";
import {
  buildDatasetSiteContexts,
  getDatasetSiteContext,
  groupDatasetUrisBySite,
} from "./datasetSiteContext";
import {
  buildSelectableTreeDatasetUris,
  getTreeDatasetSelectionState,
} from "./datasetEvidenceSelection";

const siteA = {
  metadata: { uri: "at://org/app.certified.location/site-a", cid: "cid-a" },
  record: { name: "Site A" },
};

const siteB = {
  metadata: { uri: "at://org/app.certified.location/site-b", cid: "cid-b" },
  record: { name: "Site B" },
};

const datasetA = "at://org/app.gainforest.dwc.dataset/dataset-a";
const datasetB = "at://org/app.gainforest.dwc.dataset/dataset-b";
const datasetC = "at://org/app.gainforest.dwc.dataset/dataset-c";

function selectionFor(context: ReturnType<typeof getDatasetSiteContext>, linkedDatasetUris = new Set<string>()) {
  return getTreeDatasetSelectionState({
    uri: datasetA,
    siteContext: context,
    linkedDatasetUris,
  });
}

describe("tree dataset site context", () => {
  it("marks a dataset ready when every tree resolves to one certified site", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [
        { datasetUri: datasetA, siteRef: siteA.metadata.uri },
        { datasetUri: datasetA, siteRef: ` ${siteA.metadata.uri} ` },
      ],
      locations: [siteA],
    });

    const context = getDatasetSiteContext(contexts, datasetA);

    expect(context).toEqual({
      status: "ready",
      siteSubject: { uri: siteA.metadata.uri, cid: siteA.metadata.cid },
      siteName: siteA.record.name,
    });
    expect(selectionFor(context)).toEqual({ canSelect: true, disabledReason: null });
  });

  it("disables a dataset with missing site context", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [{ datasetUri: datasetA, siteRef: null }],
      locations: [siteA],
    });

    const context = getDatasetSiteContext(contexts, datasetA);

    expect(context).toEqual({ status: "missing-site-ref" });
    expect(selectionFor(context)).toEqual({ canSelect: false, disabledReason: "missing-site-ref" });
  });

  it("disables a dataset with mixed site context", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [
        { datasetUri: datasetA, siteRef: siteA.metadata.uri },
        { datasetUri: datasetA, siteRef: siteB.metadata.uri },
      ],
      locations: [siteA, siteB],
    });

    const context = getDatasetSiteContext(contexts, datasetA);

    expect(context).toEqual({
      status: "mixed-site-refs",
      siteRefs: [siteA.metadata.uri, siteB.metadata.uri],
    });
    expect(selectionFor(context)).toEqual({ canSelect: false, disabledReason: "mixed-site-refs" });
  });

  it("disables a dataset with incomplete site context", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [
        { datasetUri: datasetA, siteRef: siteA.metadata.uri },
        { datasetUri: datasetA, siteRef: "" },
      ],
      locations: [siteA],
    });

    const context = getDatasetSiteContext(contexts, datasetA);

    expect(context).toEqual({
      status: "incomplete-site-ref",
      siteRefs: [siteA.metadata.uri],
    });
    expect(selectionFor(context)).toEqual({ canSelect: false, disabledReason: "incomplete-site-ref" });
  });

  it("disables a dataset with unresolved site context", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [{ datasetUri: datasetA, siteRef: siteA.metadata.uri }],
      locations: [],
    });

    const context = getDatasetSiteContext(contexts, datasetA);

    expect(context).toEqual({ status: "unresolved-site", siteRef: siteA.metadata.uri });
    expect(selectionFor(context)).toEqual({ canSelect: false, disabledReason: "unresolved-site" });
  });

  it("groups selected ready datasets by certified site", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [
        { datasetUri: datasetA, siteRef: siteA.metadata.uri },
        { datasetUri: datasetB, siteRef: siteA.metadata.uri },
        { datasetUri: datasetC, siteRef: siteB.metadata.uri },
      ],
      locations: [siteA, siteB],
    });

    const groups = groupDatasetUrisBySite({
      datasetUris: [datasetA, datasetB, datasetC],
      contexts,
    });

    expect(groups).toEqual([
      {
        siteSubject: { uri: siteA.metadata.uri, cid: siteA.metadata.cid },
        datasetUris: [datasetA, datasetB],
      },
      {
        siteSubject: { uri: siteB.metadata.uri, cid: siteB.metadata.cid },
        datasetUris: [datasetC],
      },
    ]);
  });

  it("disables already-linked datasets before submission", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [
        { datasetUri: datasetA, siteRef: siteA.metadata.uri },
        { datasetUri: datasetB, siteRef: siteA.metadata.uri },
      ],
      locations: [siteA],
    });
    const linkedDatasetUris = new Set([datasetA]);

    const selectable = buildSelectableTreeDatasetUris({
      rows: [{ uri: datasetA }, { uri: datasetB }],
      siteContextsByDataset: contexts,
      linkedDatasetUris,
    });

    expect(selectionFor(getDatasetSiteContext(contexts, datasetA), linkedDatasetUris)).toEqual({
      canSelect: false,
      disabledReason: "already-linked",
    });
    expect(selectable).toEqual(new Set([datasetB]));
  });

  it("disables ready datasets when not all tree context could be checked", () => {
    const contexts = buildDatasetSiteContexts({
      occurrences: [{ datasetUri: datasetA, siteRef: siteA.metadata.uri }],
      locations: [siteA],
    });

    const selectable = buildSelectableTreeDatasetUris({
      rows: [{ uri: datasetA }],
      siteContextsByDataset: contexts,
      linkedDatasetUris: new Set(),
      siteContextsUnavailable: true,
    });

    expect(getTreeDatasetSelectionState({
      uri: datasetA,
      siteContext: getDatasetSiteContext(contexts, datasetA),
      linkedDatasetUris: new Set(),
      siteContextsUnavailable: true,
    })).toEqual({ canSelect: false, disabledReason: "unable-to-verify-site-context" });
    expect(selectable).toEqual(new Set());
  });
});
