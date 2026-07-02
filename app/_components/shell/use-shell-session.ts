"use client";

import { useEffect, useState } from "react";
import type { AuthSession } from "../../_lib/auth";

export type ManageAccountKind = "organization" | "user";

type ShellSessionResponse = {
  session: AuthSession;
};

type ShellProfileResponse = {
  manageAccountKind: ManageAccountKind;
  profileName: string | null;
  hasCertifiedProfile?: boolean;
  hasCertifiedOrg?: boolean;
};

export type ShellSessionState = {
  authSession: AuthSession;
  manageAccountKind: ManageAccountKind;
  /** undefined = still loading, null = no certified profile name. */
  profileName: string | null | undefined;
  hasCertifiedProfile: boolean;
  isProfileLoading: boolean;
};

function isSameSession(a: AuthSession, b: AuthSession): boolean {
  if (a.isLoggedIn !== b.isLoggedIn) return false;
  return !a.isLoggedIn || (b.isLoggedIn && a.did === b.did);
}

/**
 * Owns the shell's session + profile state. Seeded with the session resolved
 * server-side in the root layout (correct first paint), then reconciled once
 * against /api/session + /api/session/profile on mount. Identical sessions
 * keep their object identity so the shell doesn't re-render for nothing.
 */
export function useShellSession(initialSession: AuthSession): ShellSessionState {
  const [authSession, setAuthSession] = useState<AuthSession>(initialSession);
  const [manageAccountKind, setManageAccountKind] = useState<ManageAccountKind>("user");
  const [profileName, setProfileName] = useState<string | null | undefined>(
    initialSession.isLoggedIn ? undefined : null,
  );
  const [hasCertifiedProfile, setHasCertifiedProfile] = useState<boolean>(true);
  const [isShellProfileLoading, setIsShellProfileLoading] = useState(initialSession.isLoggedIn);

  useEffect(() => {
    let cancelled = false;

    async function refreshShellSession() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        const next = response.ok ? ((await response.json()) as ShellSessionResponse) : null;
        if (cancelled) return;

        const nextSession = next?.session ?? { isLoggedIn: false as const };
        setAuthSession((prev) => (isSameSession(prev, nextSession) ? prev : nextSession));

        if (!nextSession.isLoggedIn) {
          setManageAccountKind("user");
          setProfileName(null);
          setHasCertifiedProfile(true);
          setIsShellProfileLoading(false);
          return;
        }

        setProfileName(undefined);
        setHasCertifiedProfile(true);
        setIsShellProfileLoading(true);

        try {
          const profileResponse = await fetch("/api/session/profile", { cache: "no-store" });
          const profile = profileResponse.ok
            ? ((await profileResponse.json()) as ShellProfileResponse)
            : null;
          if (cancelled) return;

          if (!profile) {
            setManageAccountKind("user");
            setProfileName(null);
            setHasCertifiedProfile(true);
            setIsShellProfileLoading(false);
            return;
          }

          setManageAccountKind(profile.manageAccountKind);
          setProfileName(profile.profileName);
          setHasCertifiedProfile(profile.hasCertifiedProfile !== false);
          setIsShellProfileLoading(false);
        } catch {
          if (cancelled) return;
          setManageAccountKind("user");
          setProfileName(null);
          setHasCertifiedProfile(true);
          setIsShellProfileLoading(false);
        }
      } catch {
        if (cancelled) return;
        setAuthSession((prev) => (prev.isLoggedIn ? { isLoggedIn: false } : prev));
        setManageAccountKind("user");
        setProfileName(null);
        setHasCertifiedProfile(true);
        setIsShellProfileLoading(false);
      }
    }

    void refreshShellSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    authSession,
    manageAccountKind,
    profileName,
    hasCertifiedProfile,
    isProfileLoading: authSession.isLoggedIn && isShellProfileLoading,
  };
}
