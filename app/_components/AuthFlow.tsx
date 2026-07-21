"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArchiveIcon,
  ArrowRightIcon,
  BinocularsIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderKanbanIcon,
  Loader2,
  LockIcon,
  LockOpenIcon,
  LogOutIcon,
  MailIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserIcon,
  Building2Icon,
  WrenchIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import type { CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";
import { accountIdentifierFromManagePath, type ManageAccountKind } from "@/lib/links";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import {
  accountObservationsPath,
  accountOrganizationsPath,
  accountPath,
  accountProjectsPath,
  accountSettingsPath,
} from "@/app/account/_lib/account-route";
import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/indexer";
import { AdminOnlyIndicator } from "./AdminOnlyIndicator";
import { useCollectedCards } from "./rewards/collected-cards";
import {
  findSwitcherGroupByIdentifier,
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
  useAccountPathContextSync,
  type AccountCard,
  type SwitcherGroup,
} from "../_lib/account-switcher";
import type { AuthSession } from "../_lib/auth";
import { buildLoginUrl, redirectToLogout } from "../_lib/auth-client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";

const AUTH_ERROR_PARAMS = new Set([
  "auth_failed",
  "epds_not_configured",
  "missing_login_identifier",
  "unknown_epds_provider",
]);

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function AuthModal() {
  return (
    <ModalContent className="py-2">
      <ModalTitle className="sr-only">Sign in to GainForest</ModalTitle>
      <ModalDescription className="sr-only">
        Sign in or create your account to access GainForest.
      </ModalDescription>
      <LoginModal />
    </ModalContent>
  );
}

function PillToggle({
  active,
  onChange,
}: {
  active: "handle" | "email";
  onChange: (tab: "handle" | "email") => void;
}) {
  return (
    <div className="flex w-full rounded-full bg-muted p-1">
      <button
        type="button"
        onClick={() => onChange("email")}
        className={cn(
          "flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
          active === "email"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Email
      </button>
      <button
        type="button"
        onClick={() => onChange("handle")}
        className={cn(
          "flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
          active === "handle"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Username
      </button>
    </div>
  );
}

function EmailForm() {
  const [email, setEmail] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setIsRedirecting(true);
    setTimeout(() => setIsRedirecting(false), 10_000);
    localStorage.setItem("auth_redirect", `${window.location.pathname}${window.location.search}`);
    window.location.href = buildLoginUrl({ email });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="login-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          disabled={isRedirecting}
        />
        <p className="text-xs text-muted-foreground">We’ll send you a sign-in code</p>
      </div>

      <Button type="submit" disabled={isRedirecting || !email.trim()} className="w-full">
        {isRedirecting ? (
          <>
            <Loader2 className="animate-spin" />
            Redirecting...
          </>
        ) : (
          <>
            Continue
            <ArrowRightIcon />
          </>
        )}
      </Button>
    </form>
  );
}

function isValidHandleLabel(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

type HandleErrorKey =
  | "invalidCharacters"
  | "missingDomain"
  | "emptyLabel"
  | "invalidLabelEdges";

function getHandleErrorKey(handle: string): HandleErrorKey | null {
  const trimmedHandle = handle.trim();

  if (!trimmedHandle) {
    return null;
  }

  if (/[^a-z0-9\-.]/.test(trimmedHandle)) {
    return "invalidCharacters";
  }

  const labels = trimmedHandle.split(".");

  if (labels.length < 2) {
    return "missingDomain";
  }

  if (labels.some((label) => label.length === 0)) {
    return "emptyLabel";
  }

  if (!labels.every(isValidHandleLabel)) {
    return "invalidLabelEdges";
  }

  return null;
}

function HandleForm() {
  const getValidationMessage = (key: HandleErrorKey) => {
    switch (key) {
      case "invalidCharacters":
        return "Only letters, numbers, hyphens, and dots are allowed.";
      case "missingDomain":
        return "Enter your full username, including the part after the dot.";
      case "emptyLabel":
        return "Each part of the username must include at least one character.";
      case "invalidLabelEdges":
        return "Each part of the username must start and end with a letter or number.";
    }
  };
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const normalizedHandle = handle.trim();
  const handleErrorKey = getHandleErrorKey(handle);
  const canSubmit = Boolean(normalizedHandle) && !handleErrorKey;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsRedirecting(true);
    setTimeout(() => setIsRedirecting(false), 10_000);
    localStorage.setItem("auth_redirect", `${window.location.pathname}${window.location.search}`);
    try {
      window.location.href = buildLoginUrl({ handle: handle.trim() });
    } catch {
      setIsRedirecting(false);
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="login-handle" className="text-sm font-medium">
          Username
        </label>
        <Input
          id="login-handle"
          type="text"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value.toLowerCase());
            setError(null);
          }}
          placeholder="alice.example.com"
          autoComplete="username"
          autoFocus
          disabled={isRedirecting}
        />

        <AnimatePresence mode="wait">
          {handleErrorKey ? (
            <motion.p
              key="herr"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-destructive"
            >
              {getValidationMessage(handleErrorKey)}
            </motion.p>
          ) : normalizedHandle ? (
            <motion.p
              key="hpreview"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-muted-foreground"
            >
              Signing in as{" "}
              <span className="text-foreground">{normalizedHandle}</span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <Button type="submit" disabled={!canSubmit || isRedirecting} className="w-full">
        {isRedirecting ? (
          <>
            <Loader2 className="animate-spin" />
            Redirecting...
          </>
        ) : (
          <>
            Continue
            <ArrowRightIcon />
          </>
        )}
      </Button>
    </form>
  );
}

function LoginModal() {
  const [activeTab, setActiveTab] = useState<"handle" | "email">("email");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full"
    >
      <div className="mb-4 flex justify-center">
        <Image
          src="/assets/media/images/gainforest-logo.svg"
          alt="GainForest logo"
          width={40}
          height={40}
        />
      </div>

      <div className="mb-6 text-center">
        <h2
          className="mb-2 text-3xl font-light tracking-[-0.02em] text-foreground"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          Get Started
        </h2>
        <p className="text-sm text-muted-foreground">Sign up or sign in to your account</p>
      </div>

      <div className="mb-6">
        <PillToggle active={activeTab} onChange={setActiveTab} />
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "email" ? (
          <motion.div
            key="email"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
          >
            <EmailForm />
          </motion.div>
        ) : (
          <motion.div
            key="handle"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            <HandleForm />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function SignInPrompt({ collapsed = false }: { collapsed?: boolean }) {
  const { pushModal, show } = useModal();
  const t = useTranslations("common.signInPrompt");
  const [signInFailed, setSignInFailed] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("error");
    setSignInFailed(error === "auth_failed");

    if (error && AUTH_ERROR_PARAMS.has(error)) {
      url.searchParams.delete("error");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const handleSignIn = () => {
    pushModal({
      id: "auth-modal",
      content: <AuthModal />,
    });
    show();
  };

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" onClick={handleSignIn} aria-label={t("getStarted")} className="mx-auto">
              <LockIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {t("getStarted")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-background p-1"
    >
      {/* Aurora stage: a soft glow that breathes brighter on hover */}
      <div className="relative h-20 overflow-hidden rounded-xl bg-gradient-to-b from-primary/[0.07] to-transparent">
        <div className="pointer-events-none absolute -left-3 -top-5 size-20 rounded-full bg-primary/20 blur-2xl transition-all duration-700 group-hover:scale-110 group-hover:bg-primary/35" />
        <div className="pointer-events-none absolute -right-4 top-1 size-16 rounded-full bg-primary/10 blur-2xl transition-all duration-700 group-hover:scale-110 group-hover:bg-primary/25" />

        {/* A spark that rises out of the lock as it opens */}
        <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 blur-[1px] transition-all duration-500 ease-out group-hover:-translate-y-[150%] group-hover:opacity-80" />

        {/* Frosted lock plate that lifts and unlocks on hover */}
        <div className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-border bg-background/70 shadow-lg backdrop-blur-md transition-all duration-500 ease-out group-hover:-translate-y-[58%] group-hover:shadow-xl">
          <LockIcon
            className="absolute size-5 text-primary transition-all duration-300 group-hover:scale-50 group-hover:opacity-0"
            strokeWidth={2.2}
          />
          <LockOpenIcon
            className="absolute size-5 scale-50 text-primary opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
            strokeWidth={2.2}
          />
        </div>
      </div>

      <p className="px-2 pb-1.5 pt-2 text-center text-[11px] leading-snug text-muted-foreground">
        {t("description")}
      </p>

      {signInFailed ? (
        <p className="mx-2 mb-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {t("failed")}
        </p>
      ) : null}

      <Button size="sm" onClick={handleSignIn} className="w-full">
        {t("getStarted")}
        <ChevronRightIcon />
      </Button>
    </motion.div>
  );
}

function AuthSkeleton() {
  // Mirrors the resolved AuthenticatedMenu trigger: a single round avatar.
  return (
    <div className="flex items-center p-1">
      <div className="skeleton h-8 w-8 rounded-full" />
    </div>
  );
}

function UnauthenticatedButtons() {
  const { pushModal, show } = useModal();
  const t = useTranslations("common.signInPrompt");

  const openAuth = () => {
    pushModal(
      {
        id: "auth",
        content: <AuthModal />,
      },
      true,
    );
    show();
  };

  return (
    <Button size="sm" onClick={openAuth}>
      {t("getStarted")}
    </Button>
  );
}

type ProfileCard = AccountCard;
type MenuGroup = SwitcherGroup;

type MenuInvitation = {
  id: string;
  repo: string;
  role: "member" | "admin";
  groupName?: string | null;
  groupHandle?: string | null;
  expiresAt: string;
};

/**
 * Splits an `/account/<identifier>/<...rest>` path into the account identifier
 * and the trailing sub-route (e.g. "/observations"). Returns null for any path
 * that is not an account route. Used to preserve the current sub-route when the
 * user switches accounts from the menu.
 */
function accountRoutePartsFromPathname(pathname: string): { identifier: string; rest: string } | null {
  const match = stripLocaleFromPathname(pathname).match(/^\/account\/([^/?#]+)((?:\/[^?#]*)?)/);
  if (!match?.[1]) return null;
  let identifier = match[1];
  try {
    identifier = decodeURIComponent(match[1]);
  } catch {
    // Keep the raw segment if it isn't valid percent-encoding.
  }
  return { identifier, rest: match[2] ?? "" };
}

function groupName(group: MenuGroup): string {
  return group.displayName?.trim() || "Organization account";
}

function roleLabel(role: CgsGroupMembership["role"]): string {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
}

function AccountDot({
  avatarUrl,
  label,
  icon,
  className,
  imageSizes = "32px",
}: {
  avatarUrl?: string | null;
  label: string;
  icon: React.ReactNode;
  className?: string;
  imageSizes?: string;
}) {
  return (
    <span className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary", className)}>
      {avatarUrl ? (
        <Image src={avatarUrl} alt={label} fill unoptimized sizes={imageSizes} className="object-cover" />
      ) : icon}
    </span>
  );
}

type MenuSubItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

type MenuAccount = {
  key: string;
  kind: "personal" | "group";
  label: string;
  subtitle: string;
  identifier: string;
  avatarUrl?: string | null;
  icon: React.ReactNode;
  group?: MenuGroup;
  subItems: MenuSubItem[];
};

function AccountBlock({
  account,
  active,
  expanded,
  onSelect,
  onToggle,
  onNavigate,
}: {
  account: MenuAccount;
  active: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-xl pr-1 transition-colors",
          active ? "bg-primary/10" : "hover:bg-muted/50",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left"
        >
          <AccountDot avatarUrl={account.avatarUrl} label={account.label} icon={account.icon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{account.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{account.subtitle}</span>
          </span>
          {active ? (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon className="h-3 w-3" />
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${account.label}` : `Expand ${account.label}`}
          aria-expanded={expanded}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <ChevronDownIcon className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="sub"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border/60 py-1 pl-3">
              {account.subItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <span className="shrink-0 text-muted-foreground/80">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AuthenticatedMenu({
  session,
  profileName,
  isProfileNameLoading = false,
}: {
  session: Extract<AuthSession, { isLoggedIn: true }>;
  profileName?: string | null;
  isProfileNameLoading?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { personal: personalCard, groups, status: groupsStatus, reload } = useAccountList(session.did);
  const [activeContext, setActiveContext] = useActiveAccountContext(session.did);
  const t = useTranslations("legacy");
  const authT = useTranslations("common.auth");
  const invitationT = useTranslations("common.groupInvitations.menu");
  const sidebarT = useTranslations("common.sidebar");
  const cleanProfileName = profileName?.trim() || personalCard?.displayName?.trim() || null;
  const profileNameLoading = isProfileNameLoading && profileName === undefined;
  const personalDisplayLabel = cleanProfileName ?? (profileNameLoading ? "Account" : "Personal account");
  const personalSecondaryLabel = cleanProfileName ? "Signed in" : profileNameLoading ? "Loading profile" : "Personal account";
  // Manage now lives at /account/<id>/manage for both personal and group
  // accounts, so the identifier alone can't say which it is — cross-reference
  // memberships, and only treat it as a group route when it matches one.
  const routeAccountIdentifier = accountIdentifierFromManagePath(pathname);
  const routeGroup = routeAccountIdentifier ? findSwitcherGroupByIdentifier(groups, routeAccountIdentifier) : null;
  const routeGroupIdentifier = routeGroup ? routeAccountIdentifier : null;
  const activeGroup = activeContext.type === "group" ? groups.find((group) => group.groupDid === activeContext.did) ?? null : null;
  const currentGroup = routeGroup ?? (activeContext.type === "group" ? activeGroup : null);
  const showingGroup = Boolean(routeGroup) || activeContext.type === "group";
  const fallbackGroupIdentifier = routeGroupIdentifier ?? (activeContext.type === "group" ? activeContext.identifier : null);
  const groupFallbackLabel = fallbackGroupIdentifier && !fallbackGroupIdentifier.startsWith("did:")
    ? fallbackGroupIdentifier
    : "Organization account";
  const groupDisplayLabel = currentGroup ? groupName(currentGroup) : groupFallbackLabel;
  const displayLabel = showingGroup ? groupDisplayLabel : personalDisplayLabel;
  const secondaryLabel = showingGroup
    ? currentGroup
      ? authT("organizationRole", { role: roleLabel(currentGroup.role) })
      : "Organization"
    : personalSecondaryLabel;
  const triggerAvatarUrl = showingGroup ? currentGroup?.avatarUrl : personalCard?.avatarUrl;
  const triggerIcon = showingGroup ? <Building2Icon className="h-4 w-4" /> : <UserIcon className="h-3.5 w-3.5" />;
  // Quick links point at each account's own profile identifier (handle or DID).
  const personalIdentifier = personalCard?.handle?.trim() ?? session.did;
  // GainForest moderators (members of the admin group, any role) reach the
  // standalone moderation panel from here. Detect membership from the account
  // list; the /admin route itself re-checks access server-side.
  const isModerator = groups.some((group) => group.groupDid === GAINFOREST_MODERATION_REPO_DID);
  const adminHref = isModerator ? "/admin" : null;
  // The donor's collected reward cards — surfaced as a special menu entry.
  const { cards: collectedCards } = useCollectedCards(session.did);
  const collectedCount = collectedCards.length;
  const [invitations, setInvitations] = useState<MenuInvitation[]>([]);
  const [invitationsStatus, setInvitationsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const invitationsStatusRef = useRef(invitationsStatus);
  const [invitationRequestKey, setInvitationRequestKey] = useState(0);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);

  useAccountPathContextSync({
    pathname,
    sessionDid: session.did,
    personalHandle: personalCard?.handle ?? null,
    groups,
    activeContext,
    setActiveContext,
  });

  const sidebarItemsT = useTranslations("common.sidebar.items");

  // The currently-selected account — route context wins over stored context.
  const selectedKey = routeGroup
    ? routeGroup.groupDid
    : activeContext.type === "group"
      ? activeContext.did
      : session.did;

  const buildSubItems = (identifier: string): MenuSubItem[] => [
    { key: "profile", label: sidebarT("profileRow.viewProfile"), href: accountPath(identifier), icon: <UserIcon className="h-3.5 w-3.5" /> },
    { key: "observations", label: sidebarItemsT("observations"), href: accountObservationsPath(identifier), icon: <BinocularsIcon className="h-3.5 w-3.5" /> },
    { key: "projects", label: sidebarItemsT("projects"), href: accountProjectsPath(identifier), icon: <FolderKanbanIcon className="h-3.5 w-3.5" /> },
    { key: "settings", label: authT("settings"), href: accountSettingsPath(identifier), icon: <SettingsIcon className="h-3.5 w-3.5" /> },
  ];

  const accounts: MenuAccount[] = [
    {
      key: session.did,
      kind: "personal",
      label: personalDisplayLabel,
      subtitle: "Personal account",
      identifier: personalIdentifier,
      avatarUrl: personalCard?.avatarUrl,
      icon: <UserIcon className="h-4 w-4" />,
      subItems: buildSubItems(personalIdentifier),
    },
    ...groups.map((group): MenuAccount => {
      const identifier = switcherGroupIdentifier(group);
      return {
        key: group.groupDid,
        kind: "group",
        label: groupName(group),
        // Spell out that this is an organization (not just the viewer's role)
        // so it's obvious which entries publish to a shared account.
        subtitle: authT("organizationRole", { role: roleLabel(group.role) }),
        identifier,
        avatarUrl: group.avatarUrl,
        icon: <Building2Icon className="h-4 w-4" />,
        group,
        subItems: buildSubItems(identifier),
      };
    }),
  ];

  // Identifiers (handles + DIDs) of accounts this user owns, used to decide
  // whether the current route is a "same sub-route across accounts" candidate.
  const ownedIdentifiers = useMemo(() => {
    const set = new Set<string>();
    const add = (value?: string | null) => {
      const normalized = value?.trim().toLowerCase();
      if (normalized) set.add(normalized);
    };
    add(session.did);
    add(personalCard?.handle);
    for (const group of groups) {
      add(group.groupDid);
      add(group.handle);
    }
    return set;
  }, [session.did, personalCard?.handle, groups]);

  const routeParts = accountRoutePartsFromPathname(pathname);
  // When the user is on one of their own account routes, switching accounts
  // should carry them to the same sub-route on the newly selected account.
  const ownedRouteRest =
    routeParts && ownedIdentifiers.has(routeParts.identifier.toLowerCase()) ? routeParts.rest : null;

  const applyContext = (account: MenuAccount) => {
    if (account.kind === "group" && account.group) {
      setActiveContext({
        type: "group",
        did: account.group.groupDid,
        identifier: switcherGroupIdentifier(account.group),
        role: account.group.role,
      });
    } else {
      setActiveContext({ type: "personal", did: session.did });
    }
  };

  // Clicking an account body switches context (and expands it). If we're on one
  // of the user's own account routes, it also mirrors the current sub-route onto
  // the selected account.
  const handleSelectAccount = (account: MenuAccount) => {
    applyContext(account);
    setExpandedKey(account.key);
    if (ownedRouteRest !== null) {
      router.push(`/account/${encodeURIComponent(account.identifier)}${ownedRouteRest}`);
      setOpen(false);
    }
  };

  const handleToggleAccount = (account: MenuAccount) => {
    setExpandedKey((current) => (current === account.key ? null : account.key));
  };

  // Sub-item links navigate on their own; we just align the context + close.
  const handleSubItemNavigate = (account: MenuAccount) => {
    applyContext(account);
    setOpen(false);
  };

  // On open, expand the currently-selected account by default.
  useEffect(() => {
    if (open) setExpandedKey(selectedKey);
    // Only re-run when the menu opens/closes; selection changes are handled inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleBlur = (event: React.FocusEvent) => {
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
    }
  };

  useEffect(() => {
    invitationsStatusRef.current = invitationsStatus;
  }, [invitationsStatus]);

  useEffect(() => {
    if (!open || invitationsStatusRef.current !== "idle") return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setInvitationsStatus("loading");
    fetch("/api/cgs/invitations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { invitations?: MenuInvitation[]; error?: string };
        if (!response.ok || data.error) throw new Error(data.error || "Could not load invitations.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
        setInvitationsStatus("ready");
      })
      .catch(() => {
        if (active) setInvitationsStatus("error");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [invitationRequestKey, open]);

  const acceptInvitation = async (invitation: MenuInvitation) => {
    setAcceptingInvitationId(invitation.id);
    try {
      const response = await fetch(`/api/cgs/invitations/${encodeURIComponent(invitation.id)}/accept`, { method: "POST", cache: "no-store" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok || data?.error) throw new Error(data?.error ?? invitationT("acceptError"));
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      void reload();
    } catch {
      setInvitationsStatus("error");
    } finally {
      setAcceptingInvitationId(null);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={displayLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-full p-0.5 ring-1 ring-border transition-shadow hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <AccountDot avatarUrl={triggerAvatarUrl} label={displayLabel} icon={triggerIcon} className="h-8 w-8" imageSizes="32px" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute top-full right-0 z-[1000] mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/60 bg-background/75 shadow-xl shadow-black/10 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65"
          >
            <div className="border-b border-border/60 px-3 py-3">
              <p className="text-sm font-medium text-foreground truncate">{displayLabel}</p>
              {secondaryLabel && (
                <p className="text-xs text-muted-foreground truncate">{secondaryLabel}</p>
              )}
            </div>

            <div className="max-h-[min(70vh,34rem)] overflow-y-auto p-2">
              {/* Accounts — explain what selecting one actually does: it decides
                  whether new uploads/projects are published as the person or as
                  an organization. */}
              <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {authT("switchAccount")}
              </p>
              <p className="px-2.5 pb-2 text-xs leading-4 text-muted-foreground">{authT("switchAccountHint")}</p>
              <div className="flex flex-col gap-0.5">
                {accounts.map((account) => (
                  <AccountBlock
                    key={account.key}
                    account={account}
                    active={selectedKey === account.key}
                    expanded={expandedKey === account.key}
                    onSelect={() => handleSelectAccount(account)}
                    onToggle={() => handleToggleAccount(account)}
                    onNavigate={() => handleSubItemNavigate(account)}
                  />
                ))}
              </div>

              {groupsStatus === "loading" ? (
                <div className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading organizations…
                </div>
              ) : null}

              {groupsStatus === "error" ? (
                <div className="mt-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p>Couldn’t load your organizations.</p>
                  <button type="button" onClick={() => void reload()} className="mt-1 font-medium underline underline-offset-2">
                    Try again
                  </button>
                </div>
              ) : null}

              <div className="my-2 h-px bg-border/60" />

              {/* Invitations */}
              {invitationsStatus === "loading" ? (
                <div className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> {invitationT("loading")}
                </div>
              ) : null}
              {invitationsStatus === "error" ? (
                <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p>{invitationT("loadError")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setInvitationsStatus("idle");
                      setInvitationRequestKey((key) => key + 1);
                    }}
                    className="mt-1 font-medium underline underline-offset-2"
                  >
                    {invitationT("tryAgain")}
                  </button>
                </div>
              ) : null}
              {invitationsStatus === "ready" && invitations.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">{invitationT("empty")}</p>
              ) : null}
              {invitations.map((invitation) => {
                const label = invitation.groupName || invitation.groupHandle || invitation.repo;
                const accepting = acceptingInvitationId === invitation.id;
                return (
                  <div key={invitation.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-left">
                    <AccountDot label={label} icon={<MailIcon className="h-4 w-4" />} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{invitationT("role", { role: roleLabel(invitation.role) })}</span>
                    </span>
                    <button
                      type="button"
                      disabled={accepting || Boolean(acceptingInvitationId)}
                      onClick={() => void acceptInvitation(invitation)}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {accepting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {accepting ? invitationT("accepting") : invitationT("accept")}
                    </button>
                  </div>
                );
              })}

              <div className="my-2 h-px bg-border/60" />

              {/* My Cards — the collectibles earned from donations. Given a
                  holographic treatment so it reads as something special. */}
              <Link
                href="/cards"
                onClick={() => setOpen(false)}
                className="group relative mb-1 flex items-center gap-2.5 overflow-hidden rounded-xl border border-primary/30 px-2.5 py-2.5 text-sm font-medium text-foreground shadow-[0_6px_20px_-10px_rgba(79,70,229,0.6)] transition-colors"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      "linear-gradient(115deg, rgba(255,0,128,0.12), rgba(255,214,0,0.09), rgba(0,229,255,0.12), rgba(123,47,247,0.12))",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                />
                <span className="relative grid size-6 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <SparklesIcon className="h-3.5 w-3.5" />
                </span>
                <span className="relative flex-1">{sidebarT("profileRow.myCards")}</span>
                {collectedCount > 0 ? (
                  <span className="relative rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {collectedCount}
                  </span>
                ) : null}
              </Link>

              {/* General options — apply to the signed-in user */}
              <Link
                href={accountOrganizationsPath(personalIdentifier)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <ShieldCheckIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {sidebarT("profileRow.myOrganizations")}
              </Link>

              <Link
                href="/submit-data"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <ArchiveIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {sidebarT("profileRow.submitData")}
              </Link>

              {adminHref ? (
                <Link
                  href={adminHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
                >
                  <WrenchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{sidebarT("profileRow.admin")}</span>
                  <AdminOnlyIndicator />
                </Link>
              ) : null}

              <Link
                href="/manage?mode=onboard-org"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <PlusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {t("authCreateNewOrganization")}
              </Link>

              <div className="my-2 h-px bg-border/60" />

              {/* Sign out */}
              <button
                onClick={redirectToLogout}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <LogOutIcon className="h-3.5 w-3.5 shrink-0" />
                {authT("signOut")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AuthButton({
  session,
  profileName,
  isProfileNameLoading,
  manageAccountKind = "user",
}: {
  session: AuthSession | null;
  profileName?: string | null;
  isProfileNameLoading?: boolean;
  manageAccountKind?: ManageAccountKind;
}) {
  if (!session) {
    return <AuthSkeleton />;
  }

  if (session.isLoggedIn) {
    return (
      <AuthenticatedMenu
        session={session}
        profileName={profileName}
        isProfileNameLoading={isProfileNameLoading}
      />
    );
  }

  return <UnauthenticatedButtons />;
}
