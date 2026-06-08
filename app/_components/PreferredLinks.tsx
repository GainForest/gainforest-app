"use client";

import { useEffect, useState, type AnchorHTMLAttributes } from "react";
import Link from "next/link";
import { accountHref, localBumicertHref, preferredDidIdentifier } from "../_lib/urls";
import { getCachedProfile, resolveDidProfile, type DidProfile } from "../_lib/did-profile";

type LinkAttrs = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function usePreferredDidIdentifier(did: string, fallbackIdentifier = did): string {
  const [profile, setProfile] = useState<DidProfile | null>(() => getCachedProfile(did) ?? null);

  useEffect(() => {
    let active = true;
    setProfile(getCachedProfile(did) ?? null);
    if (!did.startsWith("did:")) return () => { active = false; };
    resolveDidProfile(did).then((nextProfile) => {
      if (active) setProfile(nextProfile);
    });
    return () => {
      active = false;
    };
  }, [did]);

  const fallbackHandle = fallbackIdentifier !== did && !fallbackIdentifier.startsWith("did:") ? fallbackIdentifier : null;
  return preferredDidIdentifier(did, profile?.handle ?? fallbackHandle);
}

export function PreferredAccountLink({
  did,
  fallbackIdentifier,
  ...props
}: LinkAttrs & {
  did: string;
  fallbackIdentifier?: string | null;
}) {
  const identifier = usePreferredDidIdentifier(did, fallbackIdentifier ?? did);
  return <Link href={accountHref(identifier)} {...props} />;
}

export function PreferredBumicertLink({
  did,
  rkey,
  fallbackIdentifier,
  ...props
}: LinkAttrs & {
  did: string;
  rkey: string;
  fallbackIdentifier?: string | null;
}) {
  const identifier = usePreferredDidIdentifier(did, fallbackIdentifier ?? did);
  return <Link href={localBumicertHref(identifier, rkey)} {...props} />;
}
