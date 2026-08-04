/**
 * The GainForest moderation account.
 *
 * A single CGS group account (admins-gxlw.certified.one) holds every
 * moderation record the public site reads: the `test-account` / `test-record`
 * badges, the BioBlitz weekly exclusions, and the blocked-domain list. Its
 * members are the people allowed to write those records.
 *
 * Kept in its own module (rather than in `indexer.ts`) so moderation readers
 * can depend on the account without importing the whole indexer — which would
 * create an import cycle for the ones the indexer itself consumes.
 */

/** The admin group account that gates who may moderate, and holds every
 *  moderation record. Distinct from the public GainForest content repo and
 *  from FEATURED_BADGE_REPO_DID. */
export const GAINFOREST_MODERATION_REPO_DID =
  process.env.NEXT_PUBLIC_MODERATION_ACCOUNT_DID?.trim() || "did:plc:vfpcbimtprblyuubjako72qx";
