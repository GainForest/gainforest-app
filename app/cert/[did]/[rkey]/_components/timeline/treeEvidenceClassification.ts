type TreeOccurrenceClassificationInput = {
  datasetRef: string | null | undefined;
  dynamicProperties: string | null | undefined;
  establishmentMeans?: string | null | undefined;
};

type TreeDatasetClassificationInput = {
  uri: string;
  establishmentMeans?: string | null | undefined;
};

const TREE_DATA_TYPE = "measuredtree";
const TREE_SOURCE = "bumicerts";

export function getOccurrenceDynamicProperty(
  value: string | null | undefined,
  key: string,
): string | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const field = Reflect.get(parsed, key);
    return typeof field === "string" ? field : null;
  } catch {
    return null;
  }
}

function normalizeDynamicValue(value: string | null): string | null {
  return value?.trim().replaceAll(/[_\s-]+/g, "").toLowerCase() ?? null;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getOccurrenceDatasetRef(
  item: TreeOccurrenceClassificationInput,
): string | null {
  if (hasText(item.datasetRef)) return item.datasetRef!.trim();

  const dynamicDatasetRef = getOccurrenceDynamicProperty(
    item.dynamicProperties,
    "datasetRef",
  );
  return hasText(dynamicDatasetRef) ? dynamicDatasetRef!.trim() : null;
}

export function hasTreeDatasetMetadata(
  item: TreeDatasetClassificationInput,
): boolean {
  return hasText(item.establishmentMeans);
}

export function isMeasuredTreeOccurrence(
  item: TreeOccurrenceClassificationInput,
  options?: { treeDatasetUrisWithMetadata?: ReadonlySet<string> },
): boolean {
  const dataType = normalizeDynamicValue(
    getOccurrenceDynamicProperty(item.dynamicProperties, "dataType"),
  );
  const source = normalizeDynamicValue(
    getOccurrenceDynamicProperty(item.dynamicProperties, "source"),
  );

  if (dataType === TREE_DATA_TYPE || source === TREE_SOURCE) return true;

  const datasetRef = getOccurrenceDatasetRef(item);
  return Boolean(
    datasetRef &&
      options?.treeDatasetUrisWithMetadata?.has(datasetRef) &&
      hasText(item.establishmentMeans),
  );
}

export function isTreeDatasetOccurrence(
  item: TreeOccurrenceClassificationInput,
  options?: { treeDatasetUrisWithMetadata?: ReadonlySet<string> },
): boolean {
  return isMeasuredTreeOccurrence(item, options) && getOccurrenceDatasetRef(item) !== null;
}
