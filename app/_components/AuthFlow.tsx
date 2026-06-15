"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2,
  LockIcon,
  LockOpenIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import type { CgsGroupMembership } from "@/app/(manage)/manage/_lib/cgs";
import { groupIdentifierFromManagePath, groupManageBasePath, manageHref } from "@/lib/links";
import {
  findSwitcherGroupByIdentifier,
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
  useManagePathContextSync,
  type AccountCard,
  type ActiveAccountContext,
  type SwitcherGroup,
} from "../_lib/account-switcher";
import type { AuthSession } from "../_lib/auth";
import { buildLoginUrl, redirectToLogout } from "../_lib/auth-client";
import { Button } from "@/components/ui/button";
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

function AuthModal() {
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

export function SignInPrompt() {
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
  // Mirrors the resolved AuthenticatedMenu trigger: gap-2 px-2 py-1 row with a
  // round h-7 w-7 avatar, the sm-only name label, and the sm-only chevron.
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="skeleton h-7 w-7 rounded-full" />
      <div className="skeleton hidden h-3.5 w-20 rounded sm:block" />
      <div className="skeleton hidden h-3.5 w-3.5 rounded sm:block" />
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
    <motion.button
      onClick={openAuth}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="text-sm font-medium bg-primary text-primary-foreground rounded-full px-3.5 py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
    >
      {t("getStarted")}
    </motion.button>
  );
}

type ProfileCard = AccountCard;
type MenuGroup = SwitcherGroup;

function isActiveContext(active: ActiveAccountContext, type: "personal" | "group", did: string): boolean {
  return active.type === type && active.did === did;
}

function accountSegment(didOrHandle: string): string {
  return encodeURIComponent(didOrHandle);
}

function groupManageHref(group: MenuGroup): string {
  return `/manage/groups/${accountSegment(switcherGroupIdentifier(group))}`;
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
}: {
  avatarUrl?: string | null;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
      {avatarUrl ? (
        <Image src={avatarUrl} alt={label} fill unoptimized sizes="32px" className="object-cover" />
      ) : icon}
    </span>
  );
}

function AccountMenuRow({
  href,
  label,
  subtitle,
  avatarUrl,
  active,
  icon,
  onSelect,
}: {
  href: string;
  label: string;
  subtitle: string;
  avatarUrl?: string | null;
  active: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <AccountDot avatarUrl={avatarUrl} label={label} icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {active ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="h-3 w-3" />
        </span>
      ) : (
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground/45 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      )}
    </Link>
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { personal: personalCard, groups, status: groupsStatus, reload } = useAccountList(session.did);
  const [activeContext, setActiveContext] = useActiveAccountContext(session.did);
  const cleanProfileName = profileName?.trim() || personalCard?.displayName?.trim() || null;
  const profileNameLoading = isProfileNameLoading && profileName === undefined;
  const personalDisplayLabel = cleanProfileName ?? (profileNameLoading ? "Account" : "Personal account");
  const personalSecondaryLabel = cleanProfileName ? "Signed in" : profileNameLoading ? "Loading profile" : "Personal account";
  const routeGroupIdentifier = groupIdentifierFromManagePath(pathname);
  const routeGroup = routeGroupIdentifier ? findSwitcherGroupByIdentifier(groups, routeGroupIdentifier) : null;
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
    ? currentGroup ? roleLabel(currentGroup.role) : "Organization"
    : personalSecondaryLabel;
  const triggerAvatarUrl = showingGroup ? currentGroup?.avatarUrl : personalCard?.avatarUrl;
  const triggerIcon = showingGroup ? <UsersIcon className="h-4 w-4" /> : <UserIcon className="h-3.5 w-3.5" />;
  const settingsGroupIdentifier = routeGroupIdentifier
    ?? (currentGroup ? switcherGroupIdentifier(currentGroup) : null)
    ?? (activeContext.type === "group" ? activeContext.identifier || activeContext.did : null);

  useManagePathContextSync({ pathname, sessionDid: session.did, groups, activeContext, setActiveContext });

  const selectPersonal = () => {
    setActiveContext({ type: "personal", did: session.did });
    setOpen(false);
  };

  const selectGroup = (group: MenuGroup) => {
    setActiveContext({
      type: "group",
      did: group.groupDid,
      identifier: switcherGroupIdentifier(group),
      role: group.role,
    });
    setOpen(false);
  };

  const handleBlur = (event: React.FocusEvent) => {
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
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
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-muted/60 transition-colors cursor-pointer group"
      >
        <AccountDot avatarUrl={triggerAvatarUrl} label={displayLabel} icon={triggerIcon} />

        <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
          {displayLabel}
        </span>

        <motion.div
          className="hidden sm:block"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute top-full right-0 z-[1000] mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-background/95 shadow-xl shadow-black/10 backdrop-blur-sm"
          >
            <div className="border-b border-border px-3 py-3">
              <p className="text-sm font-medium text-foreground truncate">{displayLabel}</p>
              {secondaryLabel && (
                <p className="text-xs text-muted-foreground truncate">{secondaryLabel}</p>
              )}
            </div>

            <div className="max-h-[min(70vh,34rem)] overflow-y-auto p-2">
              <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Accounts
              </div>

              <AccountMenuRow
                href={manageHref({ basePath: "/manage" })}
                label={personalDisplayLabel}
                subtitle="Personal account"
                avatarUrl={personalCard?.avatarUrl}
                active={!routeGroupIdentifier && isActiveContext(activeContext, "personal", session.did)}
                icon={<UserIcon className="h-4 w-4" />}
                onSelect={selectPersonal}
              />

              {groupsStatus === "loading" ? (
                <div className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading organizations…
                </div>
              ) : null}

              {groupsStatus === "error" ? (
                <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p>Couldn’t load your organizations.</p>
                  <button type="button" onClick={() => void reload()} className="mt-1 font-medium underline underline-offset-2">
                    Try again
                  </button>
                </div>
              ) : null}

              {groupsStatus === "ready" && groups.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">No organizations yet.</p>
              ) : null}

              {groups.map((group) => (
                <AccountMenuRow
                  key={group.groupDid}
                  href={groupManageHref(group)}
                  label={groupName(group)}
                  subtitle={roleLabel(group.role)}
                  avatarUrl={group.avatarUrl}
                  active={isActiveContext(activeContext, "group", group.groupDid) || routeGroup?.groupDid === group.groupDid}
                  icon={<UsersIcon className="h-4 w-4" />}
                  onSelect={() => selectGroup(group)}
                />
              ))}

              <div className="my-2 h-px bg-border/60" />

              <Link
                href="/manage/organizations"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <ShieldCheckIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                View all organizations
              </Link>

              <Link
                href="/manage?mode=onboard-org"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <PlusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Create an organization
              </Link>

              <Link
                href={settingsGroupIdentifier ? manageHref({ basePath: groupManageBasePath(settingsGroupIdentifier) }, "settings") : manageHref({ basePath: "/manage" }, "settings")}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                Settings
              </Link>

              <div className="my-2 h-px bg-border/60" />

              <button
                onClick={redirectToLogout}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <LogOutIcon className="h-3.5 w-3.5 shrink-0" />
                Sign out
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
}: {
  session: AuthSession | null;
  profileName?: string | null;
  isProfileNameLoading?: boolean;
}) {
  if (!session) {
    return <AuthSkeleton />;
  }

  if (session.isLoggedIn) {
    return <AuthenticatedMenu session={session} profileName={profileName} isProfileNameLoading={isProfileNameLoading} />;
  }

  return <UnauthenticatedButtons />;
}
