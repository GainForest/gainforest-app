import {
  BinocularsIcon,
  BotIcon,
  Building2Icon,
  EarthIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  LeafIcon,
  NewspaperIcon,
  SproutIcon,
} from "lucide-react";

export type NavLeaf = {
  kind: "leaf";
  id: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  pathCheck: { equals?: string; startsWith?: string };
  tabCheck?: string;
  /** Only shown to GainForest admin-group members (any role). The route
   *  itself must re-check access server-side — hiding the item is cosmetic. */
  adminOnly?: boolean;
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
        pathCheck: { startsWith: "/grants" },
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
    ],
  },
];

export function isLeafActive(pathCheck: { equals?: string; startsWith?: string }, pathname: string): boolean {
  if (pathCheck.equals) return pathname === pathCheck.equals;
  if (pathCheck.startsWith) return pathname.startsWith(pathCheck.startsWith);
  return false;
}
