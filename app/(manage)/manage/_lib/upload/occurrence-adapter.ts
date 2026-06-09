import type { OccurrenceInput } from "./types";

type DwcOccurrenceBase = {
  scientificName: string;
  eventDate: string;
  basisOfRecord: string;
  decimalLatitude: string;
  decimalLongitude: string;
  occurrenceID?: string;
  occurrenceStatus?: string;
  geodeticDatum?: string;
  license?: string;
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

export type DwcOccurrenceRecord = DwcOccurrenceBase & {
  $type: "app.gainforest.dwc.occurrence";
  occurrenceID: string;
  occurrenceStatus: string;
  geodeticDatum: string;
  license: string;
  kingdom: string;
  createdAt: string;
};

export type DwcOccurrenceAppendInput = Omit<
  DwcOccurrenceBase,
  "datasetRef" | "dynamicProperties" | "establishmentMeans"
>;

function makeOccurrenceId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `tree-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assignOptionalOccurrenceFields(
  target: DwcOccurrenceBase,
  occurrence: OccurrenceInput,
): void {
  if (occurrence.vernacularName !== undefined) target.vernacularName = occurrence.vernacularName;
  if (occurrence.recordedBy !== undefined) target.recordedBy = occurrence.recordedBy;
  if (occurrence.locality !== undefined) target.locality = occurrence.locality;
  if (occurrence.country !== undefined) target.country = occurrence.country;
  if (occurrence.countryCode !== undefined) target.countryCode = occurrence.countryCode;
  if (occurrence.occurrenceRemarks !== undefined) target.occurrenceRemarks = occurrence.occurrenceRemarks;
  if (occurrence.habitat !== undefined) target.habitat = occurrence.habitat;
  if (occurrence.samplingProtocol !== undefined) target.samplingProtocol = occurrence.samplingProtocol;
  if (occurrence.kingdom !== undefined) target.kingdom = occurrence.kingdom;
  if (occurrence.siteRef !== undefined) target.siteRef = occurrence.siteRef;
  if (occurrence.establishmentMeans !== undefined) target.establishmentMeans = occurrence.establishmentMeans;
  if (occurrence.datasetRef !== undefined) target.datasetRef = occurrence.datasetRef;
  if (occurrence.dynamicProperties !== undefined) target.dynamicProperties = occurrence.dynamicProperties;
}

export function occurrenceInputToAppendInput(occurrence: OccurrenceInput): DwcOccurrenceAppendInput {
  const input: DwcOccurrenceAppendInput = {
    scientificName: occurrence.scientificName,
    eventDate: occurrence.eventDate,
    basisOfRecord: occurrence.basisOfRecord ?? "HumanObservation",
    decimalLatitude: String(occurrence.decimalLatitude),
    decimalLongitude: String(occurrence.decimalLongitude),
  };

  if (occurrence.vernacularName !== undefined) input.vernacularName = occurrence.vernacularName;
  if (occurrence.recordedBy !== undefined) input.recordedBy = occurrence.recordedBy;
  if (occurrence.locality !== undefined) input.locality = occurrence.locality;
  if (occurrence.country !== undefined) input.country = occurrence.country;
  if (occurrence.countryCode !== undefined) input.countryCode = occurrence.countryCode;
  if (occurrence.occurrenceRemarks !== undefined) input.occurrenceRemarks = occurrence.occurrenceRemarks;
  if (occurrence.habitat !== undefined) input.habitat = occurrence.habitat;
  if (occurrence.samplingProtocol !== undefined) input.samplingProtocol = occurrence.samplingProtocol;
  if (occurrence.kingdom !== undefined) input.kingdom = occurrence.kingdom;
  if (occurrence.siteRef !== undefined) input.siteRef = occurrence.siteRef;

  return input;
}

export function occurrenceInputToRecord(occurrence: OccurrenceInput): DwcOccurrenceRecord {
  const record: DwcOccurrenceRecord = {
    $type: "app.gainforest.dwc.occurrence",
    scientificName: occurrence.scientificName,
    eventDate: occurrence.eventDate,
    basisOfRecord: occurrence.basisOfRecord ?? "HumanObservation",
    decimalLatitude: String(occurrence.decimalLatitude),
    decimalLongitude: String(occurrence.decimalLongitude),
    occurrenceID: makeOccurrenceId(),
    occurrenceStatus: "present",
    geodeticDatum: "EPSG:4326",
    license: "CC-BY-4.0",
    kingdom: occurrence.kingdom ?? "Plantae",
    createdAt: new Date().toISOString(),
  };

  assignOptionalOccurrenceFields(record, occurrence);

  return record;
}
