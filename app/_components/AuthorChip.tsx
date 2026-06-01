"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import {
  resolveDidProfile,
  getCachedProfile,
  monogram,
  type DidProfile,
} from "../_lib/did-profile";
import { shortDid, formatDate } from "../_lib/format";
import { useAccountDrawer } from "./AccountDrawer";

// Owner identity + created date, shown on every record card / row / drawer.
//
// The did:plc is ALWAYS rendered (the canonical identity); the handle + avatar
// are resolved through the Bluesky AppView and fill in when they land. When no
// avatar exists (the common case for GainForest community/org DIDs) a
// deterministic monogram is drawn instead. `avatarOverride` lets a card pass a
// better picture it already has (e.g. an org's logo blob).

type Size = "sm" | "md";

export function AuthorChip({
  did,
  createdAt,
  avatarOverride,
  size = "md",
  className = "",
}: {
  did: string;
  createdAt?: string | null;
  avatarOverride?: string | null;
  size?: Size;
  className?: string;
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
  const primary = profile?.displayName || (handle ? `@${handle}` : shortDid(did));
  const date = createdAt ? formatDate(createdAt) : null;

  const av = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";
  const primaryCls = size === "sm" ? "text-[12px]" : "text-[13px]";

  return (
    <button
      type="button"
      onClick={() => openAccount(did)}
      title={`View account · ${did}`}
      className={`-mx-1 flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-surface-sunken ${className}`}
    >
      <Avatar did={did} handle={handle} avatar={avatar} className={av} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`truncate font-medium text-foreground ${primaryCls}`}>{primary}</div>
        <div className="truncate font-mono text-[10.5px] text-foreground/50">
          {handle || profile?.displayName ? (
            <>
              {shortDid(did)}
              {date ? <span className="text-foreground/35"> · {date}</span> : null}
            </>
          ) : date ? (
            <span className="text-foreground/45">{date}</span>
          ) : (
            shortDid(did)
          )}
        </div>
      </div>
    </button>
  );
}

/** Compact inline identity for dense table cells: tiny avatar + @handle (or
 *  shortened DID), the full did:plc on hover. */
export function AuthorInline({
  did,
  avatarOverride,
  dark = false,
}: {
  did: string;
  avatarOverride?: string | null;
  dark?: boolean;
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
  const label = handle ? `@${handle}` : shortDid(did);

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 align-middle" title={did}>
      <Avatar did={did} handle={handle} avatar={avatar} className="h-4 w-4 text-[8px]" />
      <span className={`truncate font-mono ${dark ? "text-ink-foreground/85" : "text-foreground/80"}`}>
        {label}
      </span>
    </span>
  );
}

/** Floating owner badge for the top-left of a card cover (Bumicerts-card
 *  style): the avatar is always shown; the @handle appears once resolved. The
 *  did:plc + created date live in the card footer, so the badge stays compact. */
export function OwnerBadge({
  did,
  avatarOverride,
}: {
  did: string;
  avatarOverride?: string | null;
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

  // Lives inside the card's <button>, so this is a role=button span that stops
  // propagation — clicking the owner opens the account drawer, not the record.
  const open = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openAccount(did);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      }}
      className="inline-flex min-w-0 cursor-pointer items-center gap-1.5"
      title={`View account${handle ? ` · @${handle}` : ""}`}
    >
      <Avatar did={did} handle={handle} avatar={avatar} className="h-5 w-5 text-[9px]" />
      {handle ? (
        <span className="truncate text-[11px] font-medium text-foreground">@{handle}</span>
      ) : null}
    </span>
  );
}

function Avatar({
  did,
  handle,
  avatar,
  className,
}: {
  did: string;
  handle: string | null;
  avatar: string | null;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (avatar && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come
    // from arbitrary PDS/CDN hosts and are tiny; next/image optimization is
    // not worth the remotePatterns surface here.
    return (
      <img
        src={avatar}
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
