"use client";

import { XIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchAccountSummary, type AccountSummary } from "../_lib/indexer";
import {
  resolveDidProfile,
  getCachedProfile,
  monogram,
  type DidProfile,
} from "../_lib/did-profile";
import {
  formatCompact,
  formatDate,
  formatRelative,
  formatCountry,
} from "../_lib/format";
import { TrustedByBadges } from "./TrustedByBadges";

// A second, higher-stacked drawer that profiles an *account* (a did:plc) rather
// than a single record. Opened by clicking any handle/owner chip. It sits at
// z-[100] so it layers cleanly over the record drawer (z-[90]); Escape is
// caught in the capture phase so it closes only this drawer, leaving any record
// drawer underneath open.

type AccountDrawerCtx = { openAccount: (did: string) => void };

const Ctx = createContext<AccountDrawerCtx>({ openAccount: () => {} });

/** Open the account profile drawer for a DID. Safe no-op without a provider. */
export function useAccountDrawer(): AccountDrawerCtx {
  return useContext(Ctx);
}

export function AccountDrawerProvider({ children }: { children: React.ReactNode }) {
  const [did, setDid] = useState<string | null>(null);
  const openAccount = useCallback((d: string) => {
    if (d && d.startsWith("did:")) setDid(d);
  }, []);
  const value = useMemo(() => ({ openAccount }), [openAccount]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <AccountDrawer did={did} onClose={() => setDid(null)} />
    </Ctx.Provider>
  );
}

function AccountDrawer({ did, onClose }: { did: string | null; onClose: () => void }) {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [profile, setProfile] = useState<DidProfile | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Escape (capture phase) + body scroll lock while open.
  useEffect(() => {
    if (!did) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = original;
    };
  }, [did, onClose]);

  // Fetch the summary + resolve the Bluesky identity (handle/avatar fallback).
  useEffect(() => {
    setSummary(null);
    setAvatarFailed(false);
    if (!did) return;
    setProfile(getCachedProfile(did) ?? null);
    const ctrl = new AbortController();
    fetchAccountSummary(did, ctrl.signal)
      .then((s) => setSummary(s))
      .catch(() => {});
    resolveDidProfile(did).then((p) => setProfile(p)).catch(() => {});
    return () => ctrl.abort();
  }, [did]);

  if (!did) return null;

  const handle = summary?.handle ?? profile?.handle ?? null;
  const displayName =
    summary?.displayName ||
    profile?.displayName ||
    handle ||
    "Organization";
  const avatar = (!avatarFailed && (summary?.avatarUrl ?? profile?.avatar)) || null;
  const m = monogram(handle, did);
  const roles: { label: string; tone: "primary" | "brand" }[] = [];
  if (summary?.hasCertifiedOrg) roles.push({ label: "Certified organization", tone: "primary" });

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
    >
      <div
        className="drawer-scrim absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="drawer-sheet thin-scroll relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto bg-background shadow-[-24px_0_60px_-30px_rgba(20,30,15,0.5)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-background/95 px-5 py-4 backdrop-blur-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-foreground/70">
            Account
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <XIcon className="h-[15px] w-[15px]" aria-hidden />
          </button>
        </div>

        <div className="px-5 pb-10 pt-6">
          {/* Identity */}
          <div className="flex items-center gap-4">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS/CDN hosts
              <img
                src={avatar}
                alt=""
                onError={() => setAvatarFailed(true)}
                className="h-[68px] w-[68px] shrink-0 rounded-2xl object-cover ring-1 ring-border-soft"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-2xl text-[26px] font-semibold text-white/95"
                style={{ backgroundColor: m.bg }}
              >
                {m.char}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="font-garamond text-[24px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
                {displayName}
              </h2>
              {handle && (
                <p className="mt-0.5 truncate text-[13px] text-primary">{handle}</p>
              )}
              <TrustedByBadges did={did} className="mt-1" size="xs" />
            </div>
          </div>

          {/* Role badges */}
          {roles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <span
                  key={r.label}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
                    r.tone === "primary"
                      ? "bg-primary/12 text-primary-dark"
                      : "bg-brand/12 text-brand-dark"
                  }`}
                >
                  {r.label}
                </span>
              ))}
              {summary?.certOrgType && (
                <span className="inline-flex items-center rounded-full bg-surface-sunken px-2.5 py-0.5 text-[11.5px] font-medium text-foreground/65">
                  {summary.certOrgType}
                </span>
              )}
            </div>
          )}

          {/* Bio */}
          {summary?.bio && (
            <p className="mt-4 whitespace-pre-line text-[14px] leading-[1.55] text-foreground/75">
              {summary.bio}
            </p>
          )}

          {/* Contribution stats */}
          {summary && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile
                label="Certs"
                value={formatCompact(summary.bumicertCount)}
                hint="impact stories created"
              />
              <StatTile
                label="Observations"
                value={formatCompact(summary.observationCount)}
                hint="nature sightings shared"
              />
            </div>
          )}

          {/* Meta */}
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-border-soft pt-4">
            <Meta label="Profile started">
              {summary === null ? (
                <Shimmer w="5rem" />
              ) : summary.createdAt ? (
                <span title={summary.createdAt}>
                  {formatDate(summary.createdAt)}
                  <span className="text-foreground/45"> · {formatRelative(summary.createdAt)}</span>
                </span>
              ) : (
                "—"
              )}
            </Meta>
            <Meta label="Country">
              {summary === null ? (
                <Shimmer w="3rem" />
              ) : summary.country ? (
                formatCountry(summary.country)
              ) : (
                "—"
              )}
            </Meta>
          </dl>

        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">
        {label}
      </div>
      <div className="mt-1 font-garamond text-[30px] font-normal leading-none tracking-[-0.01em] text-foreground">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-foreground/50">{hint}</div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px] leading-[1.45] text-foreground">{children}</dd>
    </div>
  );
}

function Shimmer({ w = "100%", h = "0.9rem" }: { w?: string; h?: string }) {
  return (
    <span
      className="skeleton inline-block rounded align-middle"
      style={{ width: w, height: h }}
    />
  );
}
