"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import {
  SearchIcon,
  XIcon,
  LayersIcon,
  Building2Icon,
  LeafIcon,
  CornerDownLeftIcon,
  Loader2Icon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BumicertOwnerAvatar } from "@/components/bumicert/BumicertOwnerAvatar";
import {
  searchEverything,
  MIN_QUERY_LENGTH,
  type GlobalSearchHit,
  type GlobalSearchKind,
  type GlobalSearchResults,
} from "../_lib/global-search";

const SEARCH_DEBOUNCE_MS = 250;

const KIND_ICON: Record<GlobalSearchKind, LucideIcon> = {
  project: LayersIcon,
  organization: Building2Icon,
  observation: LeafIcon,
};

const EMPTY_RESULTS: GlobalSearchResults = { sections: [], flat: [], totalCount: 0 };

/** Don't hijack the `/` shortcut while the user is typing somewhere else. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function GlobalSearch() {
  const t = useTranslations("common.search");
  const router = useRouter();
  const inputId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openSearch = useCallback(() => {
    setQuery("");
    setResults(EMPTY_RESULTS);
    setLoading(false);
    setError(false);
    setActiveIndex(0);
    setOpen(true);
  }, []);

  // ⌘K / Ctrl+K opens; `/` opens too when nothing else is focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmdK = e.key === "k" && (e.metaKey || e.ctrlKey);
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
      if (cmdK || slash) {
        e.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  // Debounced live search. Each keystroke cancels the previous request.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    const handle = setTimeout(() => {
      searchEverything(q, controller.signal)
        .then((next) => {
          setResults(next);
          setActiveIndex(0);
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") {
            setResults(EMPTY_RESULTS);
            setError(true);
          }
        })
        .finally(() => setLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, open]);

  const flat = results.flat;
  const safeActiveIndex = flat.length === 0 ? 0 : Math.min(activeIndex, flat.length - 1);

  const navigate = useCallback(
    (hit: GlobalSearchHit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (flat.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((safeActiveIndex + 1) % flat.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((safeActiveIndex - 1 + flat.length) % flat.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = flat[safeActiveIndex];
        if (target) navigate(target);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(flat.length - 1);
      }
    },
    [flat, safeActiveIndex, navigate],
  );

  // Reset scroll to top on every new query.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  // Keep the active row in view during keyboard navigation.
  useEffect(() => {
    if (safeActiveIndex === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-search-index="${safeActiveIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [safeActiveIndex]);

  const trimmedQuery = query.trim();
  const showEmptyState = !loading && flat.length === 0;

  return (
    <>
      <SearchTrigger onOpen={openSearch} label={t("trigger")} ariaLabel={t("open")} />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              "fixed inset-0 z-[90] bg-foreground/20 backdrop-blur-[2px]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
          />
          <Dialog.Content
            aria-describedby={undefined}
            className={cn(
              "fixed left-1/2 top-[12%] z-[100] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2",
              "overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "duration-150",
            )}
            style={{ maxHeight: "min(calc(100dvh - 6rem), 560px)", display: "flex", flexDirection: "column" }}
          >
            <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>

            {/* Input row */}
            <div className="flex items-center gap-3 border-b border-border-soft px-4">
              {loading ? (
                <Loader2Icon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <input
                ref={inputRef}
                id={inputId}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder={t("placeholder")}
                className="flex-1 bg-transparent py-3.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                aria-label={t("title")}
                aria-controls={`${inputId}-list`}
                aria-activedescendant={flat.length > 0 ? `${inputId}-item-${safeActiveIndex}` : undefined}
                role="combobox"
                aria-expanded
                aria-autocomplete="list"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveIndex(0);
                    inputRef.current?.focus();
                  }}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label={t("clear")}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="hidden select-none items-center rounded border border-border-soft bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex">
                {t("escKey")}
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} id={`${inputId}-list`} role="listbox" className="overflow-y-auto py-1.5">
              {showEmptyState ? (
                <EmptyState
                  headline={
                    error
                      ? t("error.headline")
                      : trimmedQuery.length < MIN_QUERY_LENGTH
                        ? t("idle.headline")
                        : t("noResults.headline", { query: trimmedQuery })
                  }
                  body={
                    error
                      ? t("error.body")
                      : trimmedQuery.length < MIN_QUERY_LENGTH
                        ? t("idle.body")
                        : t("noResults.body")
                  }
                />
              ) : (
                <ul>
                  {results.sections.map((section) => (
                    <li key={section.kind}>
                      <SectionHeader label={t(`kinds.${section.kind}`)} kind={section.kind} />
                      <ul>
                        {section.hits.map((hit) => {
                          const flatIndex = flat.indexOf(hit);
                          const isActive = flatIndex === safeActiveIndex;
                          return (
                            <li
                              key={hit.id}
                              id={`${inputId}-item-${flatIndex}`}
                              data-search-index={flatIndex}
                              role="option"
                              aria-selected={isActive}
                            >
                              <ResultRow
                                hit={hit}
                                active={isActive}
                                onMouseEnter={() => setActiveIndex(flatIndex)}
                                onClick={() => navigate(hit)}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border-soft px-4 py-2 text-[11px] text-muted-foreground">
              <span className="hidden items-center gap-1.5 sm:inline-flex">
                <kbd className="inline-flex items-center rounded border border-border-soft bg-muted px-1 py-0.5">↑</kbd>
                <kbd className="inline-flex items-center rounded border border-border-soft bg-muted px-1 py-0.5">↓</kbd>
                {t("hints.navigate")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="inline-flex items-center rounded border border-border-soft bg-muted px-1 py-0.5">
                  <CornerDownLeftIcon className="h-3 w-3" aria-hidden />
                </kbd>
                {t("hints.open")}
              </span>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function SearchTrigger({
  onOpen,
  label,
  ariaLabel,
}: {
  onOpen: () => void;
  label: string;
  ariaLabel: string;
}) {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMac(/mac/i.test(navigator.platform));
    }
  }, []);

  return (
    <>
      {/* Desktop: input-shaped button with the shortcut hint. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={ariaLabel}
        className="hidden h-9 items-center gap-2 rounded-full border border-border-soft bg-background/70 pl-3 pr-2 text-[13px] text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:inline-flex"
      >
        <SearchIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-[5.5rem] text-left">{label}</span>
        <kbd className="inline-flex select-none items-center gap-0.5 rounded border border-border-soft bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      {/* Mobile / tablet: compact icon button. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={ariaLabel}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
      >
        <SearchIcon className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}

function SectionHeader({ label, kind }: { label: string; kind: GlobalSearchKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <div className="flex items-center gap-1.5 px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </div>
  );
}

function ResultRow({
  hit,
  active,
  onMouseEnter,
  onClick,
}: {
  hit: GlobalSearchHit;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <ResultThumb hit={hit} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{hit.title}</span>
        {hit.subtitle && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
        )}
      </span>
    </button>
  );
}

function ResultThumb({ hit }: { hit: GlobalSearchHit }) {
  if (hit.kind === "organization") {
    return (
      <BumicertOwnerAvatar
        did={hit.did}
        avatarRef={hit.avatarRef}
        label={hit.title}
        className="h-8 w-8 shrink-0"
      />
    );
  }

  if (hit.imageUrl) {
    return (
      // Thumbnails come from arbitrary PDS/CDN hosts — a plain <img> avoids
      // enumerating every remote host for next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={hit.imageUrl}
        alt=""
        loading="lazy"
        className="h-8 w-8 shrink-0 rounded-md border border-border-soft object-cover"
      />
    );
  }

  const Icon = KIND_ICON[hit.kind];
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-soft bg-muted text-muted-foreground">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

function EmptyState({ headline, body }: { headline: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{headline}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
