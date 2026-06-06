import type { OccurrenceInput } from "./types";

export type DwcOccurrenceRecord = {
  $type: "app.gainforest.dwc.occurrence";
  scientificName: string;
  eventDate: string;
  basisOfRecord: string;
  decimalLatitude: string;
  decimalLongitude: string;
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
  createdAt: string;
};

export function occurrenceInputToRecord(occurrence: OccurrenceInput): DwcOccurrenceRecord {
  const record: DwcOccurrenceRecord = {
    $type: "app.gainforest.dwc.occurrence",
    scientificName: occurrence.scientificName,
    eventDate: occurrence.eventDate,
    basisOfRecord: occurrence.basisOfRecord ?? "HumanObservation",
    decimalLatitude: String(occurrence.decimalLatitude),
    decimalLongitude: String(occurrence.decimalLongitude),
    createdAt: new Date().toISOString(),
  };

  if (occurrence.vernacularName !== undefined) record.vernacularName = occurrence.vernacularName;
  if (occurrence.recordedBy !== undefined) record.recordedBy = occurrence.recordedBy;
  if (occurrence.locality !== undefined) record.locality = occurrence.locality;
  if (occurrence.country !== undefined) record.country = occurrence.country;
  if (occurrence.countryCode !== undefined) record.countryCode = occurrence.countryCode;
  if (occurrence.occurrenceRemarks !== undefined) record.occurrenceRemarks = occurrence.occurrenceRemarks;
  if (occurrence.habitat !== undefined) record.habitat = occurrence.habitat;
  if (occurrence.samplingProtocol !== undefined) record.samplingProtocol = occurrence.samplingProtocol;
  if (occurrence.kingdom !== undefined) record.kingdom = occurrence.kingdom;
  if (occurrence.siteRef !== undefined) record.siteRef = occurrence.siteRef;
  if (occurrence.establishmentMeans !== undefined) record.establishmentMeans = occurrence.establishmentMeans;
  if (occurrence.datasetRef !== undefined) record.datasetRef = occurrence.datasetRef;
  if (occurrence.dynamicProperties !== undefined) record.dynamicProperties = occurrence.dynamicProperties;

  return record;
}
