// Tainá's step-by-step platform guides.
//
// Structure only — every user-facing string lives in the `tainaGuide` i18n
// namespace (messages/<locale>/taina-guide.json) keyed by the ids below, so
// the guides render in all supported languages. The screenshots referenced
// here were captured from the live app (light mode, desktop) and live in
// /public/taina-guides/.
//
// Two layers per guide:
//   - `steps`: the FAQ-style walkthrough shown inside Tainá's chat panel —
//     one screenshot per step with a short title + body.
//   - `tour`: the optional live "show me" mode. Each tour step can navigate
//     to a route and spotlight a real UI element via a `[data-taina="…"]`
//     selector; Tainá hovers next to it with a speech bubble. Steps without
//     a selector show a floating bubble instead (used for "now follow the
//     wizard" style instructions where the UI is modal and self-explaining).
//
// data-taina attributes currently in the codebase:
//   add-project          → "Add project" buttons on My Projects
//   open-project         → the project card link on My Projects
//   edit-project         → "Edit project" button on a project card
//   delete-project       → "Delete project" button in the project editor
//   enable-donations     → "Enable Donations" on a project page
//   add-donation-wallet  → "Add a donation wallet" in Donation Settings
//   add-observations     → the sidebar "Add observations" button
//   bioblitz-register    → "Register to take part" on /bioblitz

export interface TainaGuideStep {
  /** i18n key suffix under tainaGuide.guides.<guideId>.steps.<id> */
  id: string;
  /** Screenshot under /taina-guides/ (webp), optional. */
  image?: string;
}

export interface TainaTourStep {
  /** i18n key suffix under tainaGuide.guides.<guideId>.tour.<id> */
  id: string;
  /** Navigate here before looking for the target (locale-less pathname). */
  route?: string;
  /** CSS selector of the element to spotlight; omit for a floating bubble. */
  selector?: string;
  /** Advance automatically when the user clicks the spotlighted element. */
  advanceOnClick?: boolean;
}

export interface TainaGuide {
  id: string;
  steps: TainaGuideStep[];
  tour: TainaTourStep[];
  /**
   * The guide only makes sense once the user owns at least one project
   * (e.g. donation setup happens on a project page). The widget checks
   * /api/manage/projects and, when the signed-in user has none, points
   * them to the createProject guide first.
   */
  requiresProject?: boolean;
}

const img = (name: string) => `/taina-guides/${name}.webp`;

export const TAINA_GUIDES: TainaGuide[] = [
  {
    id: "wallet",
    requiresProject: true,
    steps: [
      { id: "open", image: img("edit-my-projects") },
      { id: "enable", image: img("wallet-project-support") },
      { id: "addWallet", image: img("wallet-donation-settings") },
      { id: "passkeys", image: img("wallet-passkeys") },
    ],
    tour: [
      { id: "open", route: "/manage/projects", selector: '[data-taina="open-project"]', advanceOnClick: true },
      { id: "enable", selector: '[data-taina="enable-donations"]', advanceOnClick: true },
      { id: "addWallet", selector: '[data-taina="add-donation-wallet"]' },
    ],
  },
  {
    id: "createProject",
    steps: [
      { id: "start", image: img("edit-my-projects") },
      { id: "name", image: img("project-name") },
      { id: "focus", image: img("project-focus") },
      { id: "story", image: img("project-story") },
      { id: "people", image: img("project-people-places") },
      { id: "photo", image: img("project-photo") },
      { id: "review", image: img("project-created") },
    ],
    tour: [
      { id: "start", route: "/manage/projects", selector: '[data-taina="add-project"]', advanceOnClick: true },
      { id: "wizard" },
    ],
  },
  {
    id: "editProject",
    steps: [
      { id: "myProjects", image: img("edit-my-projects") },
      { id: "edit", image: img("edit-form") },
      { id: "save", image: img("edit-form") },
    ],
    tour: [
      { id: "edit", route: "/manage/projects", selector: '[data-taina="edit-project"]', advanceOnClick: true },
      { id: "save" },
    ],
  },
  {
    id: "deleteProject",
    steps: [
      { id: "editor", image: img("edit-my-projects") },
      { id: "delete", image: img("edit-form") },
      { id: "confirm", image: img("delete-confirm") },
    ],
    tour: [
      { id: "editor", route: "/manage/projects", selector: '[data-taina="edit-project"]', advanceOnClick: true },
      { id: "delete", selector: '[data-taina="delete-project"]', advanceOnClick: true },
      { id: "confirm" },
    ],
  },
  {
    id: "observations",
    steps: [
      { id: "add", image: img("obs-upload") },
      { id: "photos", image: img("obs-review") },
      { id: "check", image: img("obs-link-project") },
      { id: "publish", image: img("obs-added") },
      { id: "manage", image: img("obs-manage") },
    ],
    tour: [
      { id: "add", selector: '[data-taina="add-observations"]', advanceOnClick: true },
      { id: "photos" },
      { id: "manage", route: "/manage/observations" },
    ],
  },
  {
    id: "bioblitz",
    steps: [
      { id: "open", image: img("bioblitz-page") },
      { id: "register", image: img("bioblitz-registered") },
      { id: "upload", image: img("obs-upload") },
      { id: "win", image: img("bioblitz-how-it-works") },
    ],
    tour: [
      { id: "register", route: "/bioblitz", selector: '[data-taina="bioblitz-register"]', advanceOnClick: true },
      { id: "upload", selector: '[data-taina="add-observations"]' },
    ],
  },
];

export function getTainaGuide(id: string): TainaGuide | undefined {
  return TAINA_GUIDES.find((guide) => guide.id === id);
}

// Compact English cheat-sheet of every guide, injected into Tainá's chat
// system prompt so her free-form answers match the visual guides (she still
// replies in the visitor's language; this is reference material only).
export function buildGuideKnowledge(): string {
  return [
    "### Receive donations (set up a wallet)",
    "Donations are set up on a project, so the user needs at least one project first — if they don't have one yet, tell them to create a project before enabling donations. Donation wallets belong to organizations: the organization owner (or an admin) creates the shared wallet with a passkey (Face ID, fingerprint, or security key — no crypto experience needed), and other members can add their own passkeys so they can approve payments too. Then: My Projects → open your project → 'Enable Donations' in the Support card → 'Create wallet with passkey' → confirm with your passkey. When no donation settings existed yet, creating the wallet saves and opens donations in the same step — no extra Save press. The wallet address can receive donations right away; only the passkeys on its list can ever spend from it. Personal projects cannot add new wallets — the project must belong to an organization.",
    "### Create a project",
    "Sidebar 'Create a Project' (or My Projects → 'Add project') → wizard: name + one-line summary → focus areas → dates (ongoing is fine) → story → people & groups + places → photo → review → Create project.",
    "### Edit a project",
    "My Projects (profile → Projects tab) → 'Edit project' on the card → change fields/photo → 'Save changes'.",
    "### Delete a project",
    "My Projects → 'Edit project' → 'Delete project' at the bottom (also under Manage on the project page) → type the exact project name to confirm. Cannot be undone; observations are not deleted with it.",
    "### Upload & manage observations",
    "'Add observations' (sidebar or profile) → drop in up to 50 photos → AI suggests the species → check name/date/location, optionally link to a project → 'Add'. Manage later in profile → Observations: search, group into datasets, select & delete, card/list/map views.",
    "### BioBlitz challenge",
    "Sidebar → BioBlitz → 'Register to take part' (one click, needed for prize tracking) → photograph any living thing during the weekly round and upload as observations → prizes for most observations and best picture, plus a permanent winner badge. Observations stay in the user's account as reusable evidence.",
  ].join("\n");
}
