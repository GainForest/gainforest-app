import {
  AudioLinesIcon,
  BinocularsIcon,
  FolderKanbanIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from "lucide-react";
import {
  accountObservationsManagePath,
  accountObservationsPath,
  accountPath,
  accountProjectsPath,
  accountSettingsPath,
} from "@/app/account/_lib/account-route";

/**
 * "Your recordings" — the personal audio workspace (library, deployments,
 * upload, labelling, soundscape). Unlike its neighbours this is not an
 * /account/<id>/… route: the workspace reads the acting repo from the account
 * context, which the menu writes before the link navigates. So one URL serves
 * whichever account the row sits under.
 */
export const AUDIO_WORKSPACE_HREF = "/observations/audio?tab=library";

export type MenuSubItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Restricted to GainForest admins, and marked as such. Hiding the row is
   *  cosmetic — the destination re-checks access on its own. */
  adminOnly?: boolean;
};

export type AccountSubItemLabels = {
  profile: string;
  observations: string;
  manage: string;
  audio: string;
  projects: string;
  settings: string;
};

/**
 * The rows shown under one account in the switcher.
 *
 * Built once per account — the personal one and every organization — so each
 * account offers the same destinations, pointing at its own records. Whether
 * the audio workspace is offered is a property of the *viewer*, not of the
 * account: an admin sees the row under all of their accounts, everyone else
 * sees it under none.
 */
export function buildAccountSubItems({
  identifier,
  labels,
  showAudio,
  showManage,
}: {
  identifier: string;
  labels: AccountSubItemLabels;
  showAudio: boolean;
  showManage: boolean;
}): MenuSubItem[] {
  return [
    {
      key: "profile",
      label: labels.profile,
      href: accountPath(identifier),
      icon: <UserIcon className="h-3.5 w-3.5" />,
    },
    {
      key: "observations",
      label: labels.observations,
      href: accountObservationsPath(identifier),
      icon: <BinocularsIcon className="h-3.5 w-3.5" />,
    },
    // The dedicated surface for working on this account's sightings — adding,
    // editing and grouping them — rather than the profile tab that shows them.
    // Admin-only while it is still being worked on, like the audio workspace
    // below; the page re-checks access on its own.
    ...(showManage
      ? [
          {
            key: "manage",
            label: labels.manage,
            href: accountObservationsManagePath(identifier),
            icon: <SlidersHorizontalIcon className="h-3.5 w-3.5" />,
            adminOnly: true,
          },
        ]
      : []),
    // Straight into the recording workspace (library first), which is where
    // uploading, labelling and building a soundscape all live. Buried four
    // clicks deep otherwise, so it earns its own row next to Observations.
    // Admin-only while the workspace is still being worked on.
    ...(showAudio
      ? [
          {
            key: "audio",
            label: labels.audio,
            href: AUDIO_WORKSPACE_HREF,
            icon: <AudioLinesIcon className="h-3.5 w-3.5" />,
            adminOnly: true,
          },
        ]
      : []),
    {
      key: "projects",
      label: labels.projects,
      href: accountProjectsPath(identifier),
      icon: <FolderKanbanIcon className="h-3.5 w-3.5" />,
    },
    {
      key: "settings",
      label: labels.settings,
      href: accountSettingsPath(identifier),
      icon: <SettingsIcon className="h-3.5 w-3.5" />,
    },
  ];
}
