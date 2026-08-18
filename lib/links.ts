import { stripLocaleFromPathname } from "@/lib/i18n/routing";

const TREE_UPLOAD_FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScpHS_-7QTTiHIseqjzvkdbx6jzjenebkaLGXoETNrfit0ZNA/viewform";
const CONTENTSQUARE_UXA_BASE_URL = "https://t.contentsquare.net/uxa";

export type ManageAccountKind = "organization" | "user";
type ManageTargetKind = "personal" | "group";

export type ManageTarget = {
  kind: ManageTargetKind;
  did: string;
  accountKind: ManageAccountKind;
  /** Human/shareable identifier for URLs. For groups this is usually the handle. */
  identifier: string;
  /** Base manage route for this target. */
  basePath: string;
  role?: "owner" | "admin" | "member" | string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  currentUserDid?: string | null;
};

export type ManageSectionId =
  | "home"
  | "add"
  | "projects"
  | "sites"
  | "trees"
  | "audio"
  | "drone"
  | "bumicerts"
  | "newBumicert"
  | "observations"
  | "donations"
  | "settings"
  | "groups"
  | "organizations";

export const ACTIVE_MANAGE_CONTEXT_KEY = "gainforest-active-account-context";

const SECTION_PATHS: Record<ManageSectionId, string> = {
  home: "",
  add: "add",
  projects: "projects",
  sites: "sites",
  trees: "trees",
  audio: "audio",
  drone: "drone",
  bumicerts: "certs",
  newBumicert: "certs/new",
  observations: "observations",
  donations: "donations",
  settings: "settings",
  groups: "groups",
  organizations: "organizations",
};

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function appendQuery(path: string, query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>): string {
  if (!query) return path;
  const params = query instanceof URLSearchParams ? new URLSearchParams(query) : new URLSearchParams();
  if (!(query instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") continue;
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

// Manage now lives under the account's own profile route
// (/account/<identifier>/manage) for both personal and organization accounts.
// The legacy /manage and /manage/groups/<id> URLs are kept alive by a redirect
// shim that forwards to the new location.
export function accountManageBasePath(identifier: string): string {
  return `/account/${encodeURIComponent(identifier)}/manage`;
}

export function groupManageBasePath(identifier: string): string {
  return accountManageBasePath(identifier);
}

export function personalManageTarget(options: {
  did: string;
  accountKind: ManageAccountKind;
  identifier?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}): ManageTarget {
  return {
    kind: "personal",
    did: options.did,
    accountKind: options.accountKind,
    identifier: options.identifier?.trim() || options.did,
    basePath: accountManageBasePath(options.identifier?.trim() || options.did),
    displayName: options.displayName ?? null,
    avatarUrl: options.avatarUrl ?? null,
  };
}

export function groupManageTarget(options: {
  did: string;
  accountKind: ManageAccountKind;
  identifier?: string | null;
  role?: ManageTarget["role"];
  displayName?: string | null;
  avatarUrl?: string | null;
  currentUserDid?: string | null;
}): ManageTarget {
  const identifier = options.identifier?.trim() || options.did;
  return {
    kind: "group",
    did: options.did,
    accountKind: options.accountKind,
    identifier,
    basePath: groupManageBasePath(identifier),
    role: options.role ?? null,
    displayName: options.displayName ?? null,
    avatarUrl: options.avatarUrl ?? null,
    currentUserDid: options.currentUserDid ?? null,
  };
}

/**
 * Maps an account manage base (/account/<id>/manage) to the public profile base
 * (/account/<id>). Management now lives directly on the profile, so every
 * in-app link targets the profile route instead of /manage. The bare "/manage"
 * shim base (used by signed-out fallbacks that don't know the account yet) is
 * left untouched so it can still redirect to sign-in.
 */
export function profileBasePath(target: Pick<ManageTarget, "basePath">): string {
  const match = target.basePath.match(/^(\/account\/[^/]+)\/manage$/);
  return match ? match[1] : target.basePath;
}

export function manageHref(
  target: Pick<ManageTarget, "basePath">,
  section: ManageSectionId = "home",
  query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>,
): string {
  const suffix = SECTION_PATHS[section];
  const base = profileBasePath(target);
  const path = suffix ? `${base}/${suffix}` : base;
  return appendQuery(path, query);
}

export function manageApiHref(
  path: string,
  target?: Pick<ManageTarget, "kind" | "did"> | null,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  if (target?.kind === "group") params.set("repo", target.did);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return appendQuery(path, params);
}

function manageTreeHref(
  target: Pick<ManageTarget, "basePath">,
  options?: { dataset?: string | null; mode?: string | null },
): string {
  const query = new URLSearchParams();
  if (options?.dataset) query.set("dataset", options.dataset);
  if (options?.mode) query.set("mode", options.mode);
  return manageHref(target, "trees", query);
}

function canonicalAppPathname(pathname: string): string {
  return stripLocaleFromPathname(pathname);
}

/**
 * Extracts the account identifier from a manage path
 * (/account/<identifier>/manage[/...]). Returns the identifier for both
 * personal and organization manage routes; callers that need to know whether it
 * is an organization should cross-reference the user's group memberships.
 */
export function accountIdentifierFromManagePath(pathname: string): string | null {
  const match = canonicalAppPathname(pathname).match(/^\/account\/([^/?#]+)\/manage(?:[/?#]|$)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Extracts the account identifier from any account route
 * (/account/<identifier>[/...]), regardless of the sub-section. Returns null for
 * paths that are not account routes. Callers that need to know whether the
 * identifier is the current user's own account (vs. someone else's) should
 * cross-reference the signed-in DID/handle and group memberships.
 */
export function accountIdentifierFromPath(pathname: string): string | null {
  const match = canonicalAppPathname(pathname).match(/^\/account\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** @deprecated Use accountIdentifierFromManagePath. Retained for callers. */
export function groupIdentifierFromManagePath(pathname: string): string | null {
  return accountIdentifierFromManagePath(pathname);
}

export const links = {
  manage: {
    home: "/manage",
    groups: "/manage/groups",
    organizations: "/manage/organizations",
    edit: "/manage?mode=edit",
    onboardUser: "/manage?mode=onboard-user",
    onboardOrganization: "/manage?mode=onboard-org",
    sites: "/manage/sites",
    audio: "/manage/audio",
    drone: "/manage/drone",
    projects: "/manage/projects",
    bumicerts: "/manage/certs",
    newBumicert: "/manage/certs/new",
    trees: "/manage/trees",
    treesUpload: "/manage/trees?mode=upload",
    settings: "/manage/settings",
    target: {
      base: (target: Pick<ManageTarget, "basePath">) => manageHref(target),
      section: manageHref,
      groupBase: groupManageBasePath,
      api: manageApiHref,
      trees: manageTreeHref,
      projectsNew: (target: Pick<ManageTarget, "basePath">) => manageHref(target, "projects", { mode: "new" }),
      bumicertNewForProject: (target: Pick<ManageTarget, "basePath">, project: string) =>
        manageHref(target, "newBumicert", { forProject: project }),
    },
    treesFiltered: (options?: { dataset?: string | null }) => manageTreeHref({ basePath: "/manage" }, options),
  },
  external: {
    treeUploadFeedbackForm: TREE_UPLOAD_FEEDBACK_FORM_URL,
    treeUploadFeedbackFormEmbed: `${TREE_UPLOAD_FEEDBACK_FORM_URL}?embedded=true`,
    contentsquareUxaTag: (tagId: string) =>
      `${CONTENTSQUARE_UXA_BASE_URL}/${encodeURIComponent(tagId)}.js`,
  },
} as const;
