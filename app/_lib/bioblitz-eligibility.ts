/** Plain-text eligibility screening for the BioBlitz tracker.
 *
 * Observation photo analysis writes a regular, visual description to
 * `occurrenceRemarks`. We use explicit signals and leave anything ambiguous
 * out of the automatic leaderboard for human review.
 */
export type BioblitzImageCategory =
  | "wildlife"
  | "plant"
  | "person"
  | "potted-plant"
  | "indoors"
  | "unclassified";

export type BioblitzDescriptionInput = {
  notes?: string | null;
  kingdom?: string | null;
  scientificName?: string | null;
  vernacularName?: string | null;
};

const POT_CONTAINER = /\b(?:pot|pots|potted|flowerpot|flowerpots|houseplant|houseplants)\b/i;
const PLANT_SUBJECT =
  /\b(?:plant|plants|flower|flowers|fruit|fruits|cactus|cacti|succulent|succulents|tree|trees|shrub|shrubs|herb|herbs|orchid|orchids|bromeliad|bromeliads|fern|ferns|mangrove|mangroves|leaves|leaf|seedling|seedlings)\b/i;
const WILDLIFE_SUBJECT =
  /\b(?:animal|animals|bird|birds|crab|crabs|spider|spiders|insect|insects|butterfly|butterflies|moth|moths|bee|bees|beetle|beetles|ant|ants|fish|frog|frogs|toad|toads|snake|snakes|lizard|lizards|turtle|turtles|mammal|mammals|bat|bats|monkey|monkeys|anteater|heron|herons|egret|egrets|kingfisher|kingfishers|plover|plovers|tern|terns|fungus|fungi|mushroom|mushrooms)\b/i;
const IMAGE_PREFIX = /^(?:the\s+)?(?:image|photo|picture)\s+(?:shows|depicts|features|contains)\s+/i;
const HUMAN_AS_SUBJECT =
  /^(?:(?:a|an|one|two|three|four|several|multiple|some)\s+)?(?:(?:a\s+)?group\s+of\s+)?(?:person|people|individuals?|men|women|children|boys?|girls?|humans?)\b/i;
const HUMAN_ACTIVITY =
  /^(?:a\s+)?(?:boat|vehicle|signboard|sign|structure|building)\b[\s\S]{0,300}\b(?:person|people|individuals?|men|women|children|boys?|girls?)\b/i;
const INDOOR_SETTING =
  /\b(?:indoors?|indoor setting|inside (?:a|an|the) (?:house|home|room|building|greenhouse))\b/i;

function normaliseKingdom(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/** Categorise the primary subject described by an observation's photo analysis. */
export function classifyBioblitzImage(input: BioblitzDescriptionInput): BioblitzImageCategory {
  const notes = input.notes?.trim() ?? "";
  const taxonText = [input.scientificName, input.vernacularName].filter(Boolean).join(" ");
  const allText = `${taxonText} ${notes}`.trim();

  // Require both a plant subject and pot/container language. This avoids
  // rejecting wildlife merely because an unrelated pot appears in view.
  if (POT_CONTAINER.test(notes) && PLANT_SUBJECT.test(allText)) return "potted-plant";
  if (INDOOR_SETTING.test(notes)) return "indoors";

  const visualSubject = notes.replace(IMAGE_PREFIX, "");
  if (HUMAN_AS_SUBJECT.test(visualSubject) || HUMAN_ACTIVITY.test(visualSubject)) return "person";

  const kingdom = normaliseKingdom(input.kingdom);
  if (kingdom === "plantae") return "plant";
  if (kingdom && kingdom !== "plantae") return "wildlife";

  // Prefer the opening visual sentence so a bird perched in a tree remains a
  // wildlife observation, while incidental background details do not take over
  // the category.
  const opening = visualSubject.split(/[.!?]/, 1)[0] ?? visualSubject;
  if (WILDLIFE_SUBJECT.test(opening)) return "wildlife";
  if (PLANT_SUBJECT.test(opening)) return "plant";
  if (WILDLIFE_SUBJECT.test(allText)) return "wildlife";
  if (PLANT_SUBJECT.test(allText)) return "plant";
  return "unclassified";
}

export function isEligibleBioblitzCategory(category: BioblitzImageCategory): boolean {
  return category === "wildlife" || category === "plant";
}

// ── Points scoring ───────────────────────────────────────────────────────────
//
// The round leaderboard ranks collectors by points, not raw counts, so a
// stream of easy plant photos cannot outrank a smaller set of harder wildlife
// shots. Eligibility is unchanged — only eligible observations score at all.

/** Points for an eligible outdoor plant photo. */
export const BIOBLITZ_PLANT_POINTS = 1;
/** Points for an eligible wildlife (animal) photo. */
export const BIOBLITZ_WILDLIFE_POINTS = 2;
/** Bonus when the observation carries a real species label. */
export const BIOBLITZ_LABEL_BONUS_POINTS = 0.5;

/** Placeholder "names" that do not count as identifying the species. */
const UNIDENTIFIED_LABEL = /^(?:unidentified|unknown|unidentifiable|n\/?a|none)\b/i;

/** True when the observation names its species (scientific or vernacular)
 *  with something other than an "unidentified"-style placeholder. */
export function hasBioblitzSpeciesLabel(input: BioblitzDescriptionInput): boolean {
  for (const value of [input.scientificName, input.vernacularName]) {
    const label = value?.trim();
    if (label && !UNIDENTIFIED_LABEL.test(label)) return true;
  }
  return false;
}

/**
 * Points one observation contributes to its collector's round score:
 * 1 per plant photo, 2 per animal photo, +0.5 when the species is labeled.
 * Ineligible observations score 0.
 */
export function bioblitzObservationPoints(input: BioblitzDescriptionInput): number {
  const category = classifyBioblitzImage(input);
  if (!isEligibleBioblitzCategory(category)) return 0;
  const base = category === "wildlife" ? BIOBLITZ_WILDLIFE_POINTS : BIOBLITZ_PLANT_POINTS;
  return base + (hasBioblitzSpeciesLabel(input) ? BIOBLITZ_LABEL_BONUS_POINTS : 0);
}

export function isEligibleBioblitzDescription(input: BioblitzDescriptionInput): boolean {
  return isEligibleBioblitzCategory(classifyBioblitzImage(input));
}
