type TreeDynamicProperties = {
  dataType: "measuredTree";
  source: "bumicerts";
  datasetRef?: string;
};

export function buildTreeDynamicProperties(datasetRef?: string): string {
  const properties: TreeDynamicProperties = {
    dataType: "measuredTree",
    source: "bumicerts",
    ...(datasetRef ? { datasetRef } : {}),
  };
  return JSON.stringify(properties);
}
