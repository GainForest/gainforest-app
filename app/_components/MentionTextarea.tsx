"use client";

/**
 * A drop-in replacement for the feed's `<textarea>`s that adds @-mention
 * type-ahead: typing `@` followed by at least two characters searches accounts
 * (people + organizations) by display name and shows a dropdown of matches
 * with avatar previews. Picking one (click, Enter, or Tab) inserts `@Name `
 * into the text and reports the picked account to the parent via
 * `onPickMention`, so the parent can compute mention facets at submit time
 * (see app/_lib/mentions.ts).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type FocusEvent,
} from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, UserIcon } from "lucide-react";

import { searchAccountsByName, type AccountSearchResult } from "@/app/_lib/indexer";
import {
  applyMention,
  detectMentionQuery,
  type ActiveMentionQuery,
  type MentionCandidate,
} from "@/app/_lib/mentions";
import { ResolvedAvatar } from "@/app/feed/ResolvedAvatar";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 6;
/** Minimum query length before searching (matches searchAccountsByName). */
const MIN_QUERY_LENGTH = 2;

export function MentionTextarea({
  value,
  onValueChange,
  onPickMention,
  rows,
  maxLength,
  placeholder,
  ariaLabel,
  className,
  autoFocus = false,
  disabled = false,
  onFocus,
  onEscape,
}: {
  value: string;
  onValueChange: (text: string) => void;
  /** Called when the author picks an account from the dropdown. */
  onPickMention: (candidate: MentionCandidate) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  /** Escape pressed while the dropdown is closed (composers use it to cancel). */
  onEscape?: () => void;
}) {
  const t = useTranslations("common.feed.mentions");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [active, setActive] = useState<ActiveMentionQuery | null>(null);
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // True once a search for the current query has completed (drives "no matches").
  const [settled, setSettled] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Token starts the author dismissed with Escape — don't reopen until the
  // token changes.
  const dismissedRef = useRef<number | null>(null);
  // Caret to restore after a programmatic insertion re-renders the textarea.
  const pendingCaretRef = useRef<number | null>(null);

  const listId = useMemo(() => `mention-list-${Math.random().toString(36).slice(2, 9)}`, []);

  const syncActiveQuery = useCallback(
    (text: string) => {
      const el = textareaRef.current;
      const caret = el ? el.selectionStart ?? text.length : text.length;
      const detected = detectMentionQuery(text, caret);
      if (detected && dismissedRef.current === detected.start) {
        setActive(null);
        return;
      }
      if (detected?.start !== dismissedRef.current) dismissedRef.current = null;
      setActive(detected);
    },
    [],
  );

  // Restore the caret after inserting a mention.
  useEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret == null) return;
    pendingCaretRef.current = null;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(caret, caret);
    }
  }, [value]);

  // Debounced account search while an `@query` is active.
  const query = active && active.query.trim().length >= MIN_QUERY_LENGTH ? active.query.trim() : null;
  useEffect(() => {
    setSettled(false);
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchAccountsByName(query, MAX_SUGGESTIONS, controller.signal)
        .then((found) => {
          setResults(found);
          setHighlight(0);
          setSearching(false);
          setSettled(true);
        })
        .catch((error) => {
          if ((error as Error).name !== "AbortError") {
            setResults([]);
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const open = Boolean(active && query && (searching || settled || results.length > 0));

  const pick = useCallback(
    (account: AccountSearchResult) => {
      if (!active) return;
      const el = textareaRef.current;
      const caret = el ? el.selectionStart ?? value.length : value.length;
      const applied = applyMention(value, active.start, caret, account.displayName);
      pendingCaretRef.current = applied.caret;
      dismissedRef.current = null;
      setActive(null);
      setResults([]);
      onPickMention({ did: account.did, name: account.displayName });
      onValueChange(applied.text);
    },
    [active, value, onPickMention, onValueChange],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && results.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(results[Math.min(highlight, results.length - 1)]);
        return;
      }
    }
    if (event.key === "Escape") {
      if (open || active) {
        event.preventDefault();
        event.stopPropagation();
        if (active) dismissedRef.current = active.start;
        setActive(null);
        setResults([]);
        return;
      }
      onEscape?.();
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={textareaRef}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onValueChange(e.target.value);
          syncActiveQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={() => syncActiveQuery(value)}
        onClick={() => syncActiveQuery(value)}
        onFocus={onFocus}
        onBlur={() => {
          // Give a mousedown on a dropdown row time to fire before closing.
          window.setTimeout(() => setActive(null), 150);
        }}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        className={cn("w-full", className)}
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t("suggestionsAria")}
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          {results.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((account, index) => (
                <li key={account.did}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    onMouseDown={(e) => {
                      // mousedown (not click) so the textarea blur doesn't
                      // close the dropdown before the pick lands.
                      e.preventDefault();
                      pick(account);
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                      index === highlight ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <ResolvedAvatar
                      did={account.did}
                      avatarRef={account.avatarRef}
                      name={account.displayName}
                      fallbackIcon={<UserIcon className="size-3.5" />}
                      className="size-7"
                      sizes="28px"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {account.displayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
              {searching ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  {t("searching")}
                </>
              ) : (
                t("noMatches")
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
