const TREE_UPLOAD_FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScpHS_-7QTTiHIseqjzvkdbx6jzjenebkaLGXoETNrfit0ZNA/viewform";
const CONTENTSQUARE_UXA_BASE_URL = "https://t.contentsquare.net/uxa";

export type ManageAccountKind = "organization" | "user";
export type ManageTargetKind = "personal" | "group";

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
};

export type ManageSectionId =
  | "home"
  | "projects"
  | "sites"
  | "trees"
  | "audio"
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
  projects: "projects",
  sites: "sites",
  trees: "trees",
  audio: "audio",
  bumicerts: "bumicerts",
  newBumicert: "bumicerts/new",
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

export function groupManageBasePath(identifier: string): string {
  return `/manage/groups/${encodeURIComponent(identifier)}`;
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
    basePath: "/manage",
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
  };
}

export function manageHref(
  target: Pick<ManageTarget, "basePath">,
  section: ManageSectionId = "home",
  query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>,
): string {
  const suffix = SECTION_PATHS[section];
  const path = suffix ? `${target.basePath}/${suffix}` : target.basePath;
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

export function manageTreeHref(
  target: Pick<ManageTarget, "basePath">,
  options?: { dataset?: string | null; mode?: string | null },
): string {
  const query = new URLSearchParams();
  if (options?.dataset) query.set("dataset", options.dataset);
  if (options?.mode) query.set("mode", options.mode);
  return manageHref(target, "trees", query);
}

export function groupIdentifierFromManagePath(pathname: string): string | null {
  const match = pathname.match(/^\/manage\/groups\/([^/?#]+)(?:[/?#]|$)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function isGroupManagePath(pathname: string): boolean {
  return groupIdentifierFromManagePath(pathname) !== null;
}

export function activeContextToManagePath(rawContext: string | null | undefined): string {
  if (!rawContext) return "/manage";
  try {
    const parsed = JSON.parse(rawContext) as { type?: unknown; did?: unknown; identifier?: unknown; handle?: unknown };
    if (parsed.type === "group" && typeof parsed.did === "string") {
      const identifier = typeof parsed.identifier === "string" && parsed.identifier.trim()
        ? parsed.identifier.trim()
        : typeof parsed.handle === "string" && parsed.handle.trim()
          ? parsed.handle.trim()
          : parsed.did;
      return groupManageBasePath(identifier);
    }
  } catch {
    // Ignore malformed persisted context.
  }
  return "/manage";
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
    projects: "/manage/projects",
    bumicerts: "/manage/bumicerts",
    newBumicert: "/manage/bumicerts/new",
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
