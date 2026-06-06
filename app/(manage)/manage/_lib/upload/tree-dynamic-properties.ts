type TreeDynamicProperties = {
  dataType: "measuredTree";
  source: "gainforest";
  datasetRef?: string;
};

export function buildTreeDynamicProperties(datasetRef?: string): string {
  const properties: TreeDynamicProperties = {
    dataType: "measuredTree",
    source: "gainforest",
    ...(datasetRef ? { datasetRef } : {}),
  };
  return JSON.stringify(properties);
}
