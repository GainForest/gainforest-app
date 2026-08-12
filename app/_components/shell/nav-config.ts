import {
  AudioLinesIcon,
  BinocularsIcon,
  BotIcon,
  Building2Icon,
  EarthIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  LeafIcon,
  MicroscopeIcon,
  NewspaperIcon,
  SproutIcon,
  TargetIcon,
} from "lucide-react";

export type NavLeaf = {
  kind: "leaf";
  id: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  pathCheck: { equals?: string; startsWith?: string };
  /** Optional query-string tab that must be active for this item. */
  tabCheck?: string;
  /** Optional query-string tab that makes this otherwise matching item inactive. */
  tabExclude?: string;
  /** Only shown to GainForest admin-group members (any role). The route
   *  itself must re-check access server-side — hiding the item is cosmetic. */
  adminOnly?: boolean;
  /** Shown to organizations enrolled in a Rewilding grant slot, and to
   *  GainForest admins (who can preview the dashboard). Cosmetic, like
   *  adminOnly — the routes re-check server-side. */
  rewildingGranteeOnly?: boolean;
};

export type NavSection = {
  kind: "section";
  id: string;
  text: string;
  items: NavLeaf[];
};

// `text` values here are fallbacks/documentation only — the sidebar renders
// translated labels from common.sidebar.items / common.sidebar.sections.
export const NAV_ITEMS: NavSection[] = [
  {
    kind: "section",
    id: "explore",
    text: "EXPLORE",
    items: [
      {
        kind: "leaf",
        id: "feed",
        text: "Feed",
        Icon: NewspaperIcon,
        href: "/feed",
        pathCheck: { startsWith: "/feed" },
      },
      {
        kind: "leaf",
        id: "projects",
        text: "Projects",
        Icon: FolderKanbanIcon,
        href: "/projects",
        pathCheck: { startsWith: "/projects" },
      },
      {
        kind: "leaf",
        id: "organizations",
        text: "Organizations",
        Icon: Building2Icon,
        href: "/organizations",
        pathCheck: { startsWith: "/organizations" },
      },
      {
        kind: "leaf",
        id: "observations",
        text: "Observations",
        Icon: BinocularsIcon,
        href: "/observations",
        pathCheck: { startsWith: "/observations" },
      },
      {
        kind: "leaf",
        id: "globe",
        text: "Globe",
        Icon: EarthIcon,
        href: "/globe",
        pathCheck: { startsWith: "/globe" },
      },
    ],
  },
  {
    kind: "section",
    id: "funding",
    text: "FUNDING",
    items: [
      {
        kind: "leaf",
        id: "bioblitz",
        text: "BioBlitz",
        Icon: LeafIcon,
        href: "/bioblitz",
        pathCheck: { startsWith: "/bioblitz" },
      },
      {
        kind: "leaf",
        id: "donations",
        text: "Donations",
        Icon: HeartHandshakeIcon,
        href: "/donations",
        pathCheck: { startsWith: "/donations" },
        // The donations hub is admin-only for now; hide it from the public.
        adminOnly: true,
      },
      {
        kind: "leaf",
        id: "grants",
        text: "Grants",
        Icon: SproutIcon,
        href: "/grants",
        // Exact match: the Rewilding grantee pages live under /grants/* and
        // own their own rows below, so they must not light this one up.
        pathCheck: { equals: "/grants" },
      },
      // The Rewilding the Web grantee dashboard: shown to the organizations
      // enrolled in one of the program's ten slots, and to GainForest admins
      // as a preview. The routes re-check access server-side, so hiding
      // these rows is only cosmetic.
      {
        kind: "leaf",
        id: "myGrant",
        text: "My grant",
        Icon: TargetIcon,
        href: "/grants/my-grant",
        pathCheck: { startsWith: "/grants/my-grant" },
        rewildingGranteeOnly: true,
      },
      {
        kind: "leaf",
        id: "myRecorders",
        text: "My recorders",
        Icon: AudioLinesIcon,
        href: "/grants/my-recorders",
        pathCheck: { startsWith: "/grants/my-recorders" },
        rewildingGranteeOnly: true,
      },
    ],
  },
  {
    kind: "section",
    id: "ai",
    text: "AI",
    items: [
      {
        kind: "leaf",
        id: "taina",
        text: "Tainá",
        Icon: BotIcon,
        href: "/taina",
        pathCheck: { startsWith: "/taina" },
      },
      {
        kind: "leaf",
        id: "labeler",
        text: "Labeler",
        Icon: MicroscopeIcon,
        href: "/labeler",
        pathCheck: { startsWith: "/labeler" },
      },
      // AudioMoth is no longer a sidebar destination: audio records live under
      // Observations (/observations/audio), device setup under
      // /observations/devices. AI keeps only Taína and the Labeler.
    ],
  },
  // Admin has no sidebar section on purpose: it is a staff area, reached from
  // the account menu's Admin link, and /admin groups its pages into cards.
];

export function isLeafActive(pathCheck: { equals?: string; startsWith?: string }, pathname: string): boolean {
  if (pathCheck.equals) return pathname === pathCheck.equals;
  if (pathCheck.startsWith) return pathname.startsWith(pathCheck.startsWith);
  return false;
}
