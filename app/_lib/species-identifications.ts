import { resolvePdsHost } from "./pds";

export const SPECIES_IDENTIFICATION_COLLECTION = "app.gainforest.dwc.identification";
export const SPECIES_IDENTIFICATION_TAG = "species-identification";
const IDENTIFICATION_REF_PREFIX = "identification:";

export type SpeciesIdentificationRecord = {
  uri: string;
  cid: string | null;
  did: string;
  rkey: string;
  subjectUri: string;
  scientificName: string;
  vernacularName: string | null;
  taxonID: string | null;
  taxonRank: string | null;
  confidence: number | null;
  identificationRemarks: string | null;
  createdAt: string | null;
};

export function speciesIdentificationTags(rkey: string): string[] {
  return [SPECIES_IDENTIFICATION_TAG, `${IDENTIFICATION_REF_PREFIX}${rkey}`];
}

export function identificationRkeyFromTags(tags: readonly string[] | null | undefined): string | null {
  const value = tags?.find((tag) => tag.startsWith(IDENTIFICATION_REF_PREFIX))?.slice(IDENTIFICATION_REF_PREFIX.length).trim();
  return value && /^[a-zA-Z0-9._~:-]+$/.test(value) ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Read one identification directly from its author's PDS. Discovery happens
 * through the tagged notification comment, while the structured lexicon record
 * remains the source of truth even before the public indexer supports it.
 */
export async function fetchSpeciesIdentification(
  did: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<SpeciesIdentificationRecord | null> {
  try {
    const host = await resolvePdsHost(did, signal);
    if (!host) return null;
    const params = new URLSearchParams({ repo: did, collection: SPECIES_IDENTIFICATION_COLLECTION, rkey });
    const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      uri?: unknown;
      cid?: unknown;
      value?: {
        $type?: unknown;
        subject?: { uri?: unknown } | null;
        scientificName?: unknown;
        vernacularName?: unknown;
        taxonID?: unknown;
        taxonRank?: unknown;
        confidence?: unknown;
        identificationRemarks?: unknown;
        createdAt?: unknown;
      };
    };
    const scientificName = optionalString(data.value?.scientificName);
    const subjectUri = optionalString(data.value?.subject?.uri);
    if (
      data.value?.$type !== SPECIES_IDENTIFICATION_COLLECTION ||
      !scientificName ||
      !subjectUri ||
      typeof data.uri !== "string"
    ) return null;

    return {
      uri: data.uri,
      cid: optionalString(data.cid),
      did,
      rkey,
      subjectUri,
      scientificName,
      vernacularName: optionalString(data.value.vernacularName),
      taxonID: optionalString(data.value.taxonID),
      taxonRank: optionalString(data.value.taxonRank),
      confidence: typeof data.value.confidence === "number" && Number.isInteger(data.value.confidence)
        ? Math.min(100, Math.max(0, data.value.confidence))
        : null,
      identificationRemarks: optionalString(data.value.identificationRemarks),
      createdAt: optionalString(data.value.createdAt),
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return null;
  }
}
