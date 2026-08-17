import {
  AudioLinesIcon,
  BinocularsIcon,
  FolderKanbanIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from "lucide-react";
import {
  accountAudioManagePath,
  accountObservationsManagePath,
  accountObservationsPath,
  accountPath,
  accountProjectsPath,
  accountSettingsPath,
} from "@/app/account/_lib/account-route";

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
    // The recording workspace — library, deployments, upload, labelling,
    // identifications, soundscape, device setup — hosted on this account's own
    // audio manage page, so the row acts on the account it sits under.
    // Admin-only while the workspace is still being worked on.
    ...(showAudio
      ? [
          {
            key: "audio",
            label: labels.audio,
            href: accountAudioManagePath(identifier),
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
