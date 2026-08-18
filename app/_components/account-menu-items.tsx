import {
  BinocularsIcon,
  FolderKanbanIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import {
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
};

export type AccountSubItemLabels = {
  profile: string;
  observations: string;
  projects: string;
  settings: string;
};

/**
 * The rows shown under one account in the switcher.
 *
 * Built once per account — the personal one and every organization — so each
 * account offers the same destinations, pointing at its own records. The
 * account-specific management surface lives in the sidebar rather than being
 * repeated inside every account's switcher rows.
 */
export function buildAccountSubItems({
  identifier,
  labels,
}: {
  identifier: string;
  labels: AccountSubItemLabels;
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
