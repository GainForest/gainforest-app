"use client";

import { useEffect, useState } from "react";
import {
  resolveDidProfile,
  getCachedProfile,
  monogram,
  type DidProfile,
} from "../_lib/did-profile";
import { formatDate } from "../_lib/format";
import { resolveBlobUrl } from "../_lib/pds";
import { useAccountDrawer } from "./AccountDrawer";
import { AccountHoverCard } from "./AccountHoverCard";

// Owner identity + created date, shown on every record card / row / drawer.
//
// Certified profile names and avatars fill in when they land. When no avatar
// exists (the common case for GainForest community/org DIDs) a deterministic
// monogram is drawn instead. `avatarOverride` lets a card pass a better picture
// it already has (e.g. an org's logo blob).

type Size = "sm" | "md";

export function AuthorChip({
  did,
  createdAt,
  avatarOverride,
  avatarRefOverride,
  nameOverride,
  size = "md",
  className = "",
  onOpenAccount,
}: {
  did: string;
  createdAt?: string | null;
  avatarOverride?: string | null;
  avatarRefOverride?: string | null;
  nameOverride?: string | null;
  size?: Size;
  className?: string;
  /** Close a containing sheet before this chip opens the account drawer. */
  onOpenAccount?: () => void;
}) {
  const [profile, setProfile] = useState<DidProfile | null>(() => getCachedProfile(did) ?? null);

  useEffect(() => {
    let active = true;
    setProfile(getCachedProfile(did) ?? null);
    resolveDidProfile(did).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [did]);

  const { openAccount } = useAccountDrawer();
  const handle = profile?.handle ?? null;
  const avatar = avatarOverride ?? profile?.avatar ?? null;
  const primary = nameOverride || profile?.displayName || handle || "Organization";
  const date = createdAt ? formatDate(createdAt) : null;

  const av = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";
  const primaryCls = size === "sm" ? "text-[12px]" : "text-[13px]";

  return (
    <AccountHoverCard
      did={did}
      name={primary}
      avatarRef={avatarRefOverride ?? null}
      triggerClassName="block w-full min-w-0"
    >
      <button
        type="button"
        onClick={() => {
          onOpenAccount?.();
          openAccount(did);
        }}
        title="View profile"
        className={`-mx-1 flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-surface-sunken ${className}`}
      >
        <Avatar did={did} handle={handle} avatar={avatar} avatarRef={avatarRefOverride ?? null} className={av} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`truncate font-medium text-foreground ${primaryCls}`}>{primary}</div>
          {date ? (
            <div className="truncate text-[10.5px] text-foreground/50">
              Shared {date}
            </div>
          ) : null}
        </div>
      </button>
    </AccountHoverCard>
  );
}

/** Compact inline identity for dense table cells: tiny avatar + @handle (or
 *  shortened DID), the full did:plc on hover. */
export function AuthorInline({
  did,
  avatarOverride,
  avatarRefOverride,
  nameOverride,
  showAvatar = true,
}: {
  did: string;
  avatarOverride?: string | null;
  avatarRefOverride?: string | null;
  nameOverride?: string | null;
  showAvatar?: boolean;
}) {
  const [profile, setProfile] = useState<DidProfile | null>(() => getCachedProfile(did) ?? null);
  useEffect(() => {
    let active = true;
    setProfile(getCachedProfile(did) ?? null);
    resolveDidProfile(did).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [did]);

  const handle = profile?.handle ?? null;
  const avatar = avatarOverride ?? profile?.avatar ?? null;
  const label = nameOverride || profile?.displayName || handle || "Supporter";

  return (
    <AccountHoverCard
      did={did}
      name={label}
      avatarRef={avatarRefOverride ?? null}
      triggerClassName="inline-flex max-w-full min-w-0 align-middle"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5 align-middle" title={label}>
        {showAvatar ? <Avatar did={did} handle={handle} avatar={avatar} avatarRef={avatarRefOverride ?? null} className="h-4 w-4 text-[8px]" /> : null}
        <span className="truncate text-foreground/80">{label}</span>
      </span>
    </AccountHoverCard>
  );
}

function Avatar({
  did,
  handle,
  avatar,
  avatarRef,
  className,
}: {
  did: string;
  handle: string | null;
  avatar: string | null;
  avatarRef: string | null;
  className: string;
}) {
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setResolvedAvatar(null);
    if (avatar || !avatarRef) return;

    const controller = new AbortController();
    resolveBlobUrl(did, avatarRef, controller.signal)
      .then((url) => setResolvedAvatar(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolvedAvatar(null);
      });

    return () => controller.abort();
  }, [avatar, avatarRef, did]);

  const src = avatar ?? resolvedAvatar;

  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come
    // from arbitrary PDS/CDN hosts and are tiny; next/image optimization is
    // not worth the remotePatterns surface here.
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  const m = monogram(handle, did);
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white/95 ${className}`}
      style={{ backgroundColor: m.bg }}
    >
      {m.char}
    </span>
  );
}
