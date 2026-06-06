export type ColumnMapping = {
  sourceColumn: string;
  targetField: string;
  transform?: (value: string) => string;
};

export type MappedRow = Record<string, string>;

export type OccurrenceInput = {
  scientificName: string;
  eventDate: string;
  decimalLatitude: number;
  decimalLongitude: number;
  basisOfRecord?: string;
  vernacularName?: string;
  recordedBy?: string;
  locality?: string;
  country?: string;
  countryCode?: string;
  occurrenceRemarks?: string;
  habitat?: string;
  samplingProtocol?: string;
  kingdom?: string;
  siteRef?: string;
  establishmentMeans?: string;
  datasetRef?: string;
  dynamicProperties?: string;
};

export type FloraMeasurementBundle = {
  dbh?: string;
  totalHeight?: string;
  diameter?: string;
  canopyCoverPercent?: string;
};

export type UrlPhotoEntry = {
  source: "url";
  url: string;
  subjectPart: string;
};

export type KoboZipPhotoEntry = {
  source: "koboZip";
  entryPath: string;
  fileName: string;
  mimeType: string;
  subjectPart: string;
};

export type PhotoEntry = UrlPhotoEntry | KoboZipPhotoEntry;

export type ValidatedRow = {
  index: number;
  occurrence: OccurrenceInput;
  floraMeasurement: FloraMeasurementBundle | null;
  photos?: PhotoEntry[];
};

export type RowError = {
  index: number;
  issues: { path: string; message: string }[];
};

export type TreeUploadRowAttentionKind = "skipped" | "failed" | "partial";

export type TreeUploadRowAttentionSummary = {
  sourceRowIndex: number;
  rowLabel: string;
  messages: string[];
  kind: TreeUploadRowAttentionKind;
};

export type ValidationResult = {
  valid: ValidatedRow[];
  errors: RowError[];
};

export type TargetField = {
  field: string;
  label: string;
  required: boolean;
  category: "occurrence" | "measurement" | "media";
};

export function getTargetFieldLabel(field: string): string {
  return TARGET_FIELDS.find((item) => item.field === field)?.label ?? field;
}

export const TARGET_FIELDS: TargetField[] = [
  { field: "scientificName", label: "Scientific Name", required: true, category: "occurrence" },
  { field: "eventDate", label: "Event Date", required: true, category: "occurrence" },
  { field: "decimalLatitude", label: "Decimal Latitude", required: true, category: "occurrence" },
  { field: "decimalLongitude", label: "Decimal Longitude", required: true, category: "occurrence" },
  { field: "vernacularName", label: "Vernacular Name", required: false, category: "occurrence" },
  { field: "recordedBy", label: "Shared By", required: false, category: "occurrence" },
  { field: "locality", label: "Locality", required: false, category: "occurrence" },
  { field: "country", label: "Country", required: false, category: "occurrence" },
  { field: "occurrenceRemarks", label: "Occurrence Remarks", required: false, category: "occurrence" },
  { field: "habitat", label: "Habitat", required: false, category: "occurrence" },
  { field: "height", label: "Height", required: false, category: "measurement" },
  { field: "dbh", label: "DBH", required: false, category: "measurement" },
  { field: "diameter", label: "Diameter", required: false, category: "measurement" },
  { field: "canopyCoverPercent", label: "Canopy Cover (%)", required: false, category: "measurement" },
  { field: "photoUrl", label: "Photo URL", required: false, category: "media" },
];
