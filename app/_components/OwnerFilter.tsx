"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { CheckIcon, ChevronDownIcon, SearchIcon, UserRoundIcon, XIcon } from "lucide-react";
import { BumicertOwnerAvatar } from "@/components/bumicert/BumicertOwnerAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchAccountsByName, type AccountSearchResult } from "../_lib/indexer";
import { getCachedProfile, resolveDidProfile, type DidProfile } from "../_lib/did-profile";

const OWNER_QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;

/** Reads/writes the shareable `?by=<did>` owner filter on an explore page. */
export function useOwnerFilter() {
  const [byParam, setByParam] = useQueryState("by", parseAsString.withOptions(OWNER_QUERY_STATE_OPTIONS));
  const ownerDid = byParam && byParam.startsWith("did:") ? byParam : null;
  const setOwnerDid = useCallback(
    (did: string | null) => {
      void setByParam(did && did.startsWith("did:") ? did : null);
    },
    [setByParam],
  );
  return { ownerDid, setOwnerDid };
}

/** Resolve a DID to its display name + avatar for the chip/picker label. */
function useResolvedProfile(did: string | null): DidProfile | null {
  const [profile, setProfile] = useState<DidProfile | null>(() => (did ? getCachedProfile(did) ?? null : null));

  useEffect(() => {
    if (!did) {
      setProfile(null);
      return;
    }
    const cached = getCachedProfile(did);
    if (cached) {
      setProfile(cached);
      return;
    }
    let active = true;
    resolveDidProfile(did)
      .then((resolved) => {
        if (active) setProfile(resolved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [did]);

  return profile;
}

/** The owner picker button: opens a type-ahead search of people & orgs. Sits
 *  next to the Sort control on every explore page. */
export function OwnerFilterButton({
  ownerDid,
  onChange,
  className,
}: {
  ownerDid: string | null;
  onChange: (did: string | null) => void;
  className?: string;
}) {
  const t = useTranslations("marketplace.ownerFilter");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const profile = useResolvedProfile(ownerDid);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const handle = setTimeout(() => {
      searchAccountsByName(q, 8, controller.signal)
        .then((next) => setResults(next))
        .catch((error) => {
          if ((error as Error).name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, open]);

  const selectedLabel = ownerDid ? profile?.displayName ?? t("selectedFallback") : null;
  const trimmedQuery = query.trim();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("ariaLabel")}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            ownerDid
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground hover:shadow-sm",
            className,
          )}
        >
          {ownerDid ? (
            <BumicertOwnerAvatar
              did={ownerDid}
              avatarUrl={profile?.avatar}
              label={selectedLabel ?? ""}
              className="h-5 w-5 shrink-0"
            />
          ) : (
            <UserRoundIcon className="h-4 w-4" />
          )}
          <span className="max-w-[140px] truncate">{ownerDid ? selectedLabel : t("button")}</span>
          <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-2rem))] p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
          {ownerDid ? (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <XIcon className="h-3.5 w-3.5" />
              </span>
              {t("showAll")}
            </button>
          ) : null}

          {loading ? (
            <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">{t("searching")}</p>
          ) : trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">{t("noResults")}</p>
          ) : trimmedQuery.length < MIN_QUERY_LENGTH && !ownerDid ? (
            <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">{t("hint")}</p>
          ) : null}

          {results.map((result) => {
            const active = result.did === ownerDid;
            return (
              <button
                key={result.did}
                type="button"
                onClick={() => {
                  onChange(result.did);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/60",
                )}
              >
                <BumicertOwnerAvatar
                  did={result.did}
                  avatarRef={result.avatarRef}
                  label={result.displayName}
                  className="h-7 w-7 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{result.displayName}</span>
                {active ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The removable "Showing <name>" chip shown above the results grid when an
 *  owner filter is active. */
export function OwnerFilterBanner({
  ownerDid,
  onClear,
  className,
}: {
  ownerDid: string | null;
  onClear: () => void;
  className?: string;
}) {
  const t = useTranslations("marketplace.ownerFilter");
  const profile = useResolvedProfile(ownerDid);
  if (!ownerDid) return null;
  const name = profile?.displayName ?? t("selectedFallback");

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border border-primary/30 bg-primary/5 py-1 pl-1.5 pr-1 text-sm",
        className,
      )}
    >
      <BumicertOwnerAvatar did={ownerDid} avatarUrl={profile?.avatar} label={name} className="h-6 w-6 shrink-0" />
      <span className="min-w-0 truncate text-foreground">{t("showing", { name })}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={t("clear")}
        className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
