import maEarthDonations from "./data/maearth-donations.json";

const DONATION_ENTRIES: Record<string, { orgSlug: string; donateUrl: string }> =
  (maEarthDonations as { entries: Record<string, { orgSlug: string; donateUrl: string }> }).entries;

const MA_EARTH_DONATION_DIDS = new Set(Object.keys(DONATION_ENTRIES));

export function hasMaEarthDonationUrl(did: string | null | undefined): boolean {
  return Boolean(did && MA_EARTH_DONATION_DIDS.has(did));
}

export function maEarthDonationUrlForDid(did: string): string | null {
  return DONATION_ENTRIES[did]?.donateUrl ?? null;
}
