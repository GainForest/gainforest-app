"use client";

/**
 * Interactive layer for the feed — Bluesky-style like + comment + post over the
 * app.gainforest.feed.* lexicons.
 *
 * Reads counts, viewer-like state, and comment threads from the hyperindex
 * (app/_lib/feed-engagement.ts); writes through the mutation helpers. Because
 * Tap ingestion lags a write by a few seconds, every write applies an OPTIMISTIC
 * overlay immediately and the indexer reconciles it on the next load.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HeartIcon, ImageIcon, Loader2Icon, MessageCircleIcon, SendHorizonalIcon, UserIcon } from "lucide-react";
import {
  createFeedComment,
  createFeedLike,
  createFeedPost,
  deleteFeedLike,
} from "@/app/(manage)/manage/_lib/mutations";
import {
  emptyEngagement,
  fetchComments,
  fetchEngagement,
  type Engagement,
  type FeedComment,
} from "@/app/_lib/feed-engagement";
import { redirectToLogin } from "@/app/_lib/auth-client";
import { formatRelative } from "@/app/_lib/format";
import { useAccountList } from "@/app/_lib/account-switcher";
import { useAddObservations } from "@/app/_components/useAddObservations";
import { cn } from "@/lib/utils";
import { ResolvedAvatar } from "./ResolvedAvatar";

/** The signed-in viewer's personal display name + avatar, for composer and
 *  comment identity (posts/comments always write to the personal repo). */
function useViewerCard(viewerDid: string | null): { name: string | null; avatarUrl: string | null } {
  const { personal } = useAccountList(viewerDid);
  return { name: personal?.displayName?.trim() || null, avatarUrl: personal?.avatarUrl ?? null };
}

export type LocalPost = { id: string; text: string; createdAt: string };

export type FeedInteractions = {
  viewerDid: string | null;
  getEngagement: (uri: string) => Engagement;
  loadEngagement: (uris: string[]) => void;
  toggleLike: (uri: string) => Promise<void>;
  getComments: (uri: string) => FeedComment[] | undefined;
  loadComments: (uri: string) => Promise<void>;
  addComment: (uri: string, text: string) => Promise<void>;
  localPosts: LocalPost[];
  addPost: (text: string) => Promise<void>;
};

const POST_MAX = 300;
const COMMENT_MAX = 1000;

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** Indexer-backed engagement state with optimistic overlays for the viewer's
 *  own writes. */
export function useFeedInteractions(viewerDid: string | null): FeedInteractions {
  const [engagement, setEngagement] = useState<Map<string, Engagement>>(() => new Map());
  const [comments, setComments] = useState<Map<string, FeedComment[]>>(() => new Map());
  const [localPosts, setLocalPosts] = useState<LocalPost[]>([]);
  // URIs whose engagement has been requested already (avoids refetch storms).
  const requestedRef = useRef<Set<string>>(new Set());

  // Reset everything when the viewer changes (sign in / out).
  useEffect(() => {
    requestedRef.current = new Set();
    setEngagement(new Map());
    setComments(new Map());
    setLocalPosts([]);
  }, [viewerDid]);

  const getEngagement = useCallback(
    (uri: string): Engagement => engagement.get(uri) ?? emptyEngagement(),
    [engagement],
  );

  const loadEngagement = useCallback(
    (uris: string[]) => {
      const todo = uris.filter((u) => u && u.startsWith("at://") && !requestedRef.current.has(u));
      if (todo.length === 0) return;
      todo.forEach((u) => requestedRef.current.add(u));
      void fetchEngagement(todo, viewerDid)
        .then((map) => {
          setEngagement((prev) => {
            const next = new Map(prev);
            for (const [u, e] of map) {
              // Don't clobber an optimistic like the indexer hasn't caught yet.
              const existing = prev.get(u);
              if (existing?.viewerLikeUri === "optimistic" && !e.viewerLikeUri) {
                next.set(u, { ...e, likeCount: Math.max(e.likeCount, existing.likeCount), viewerLikeUri: "optimistic" });
              } else {
                next.set(u, e);
              }
            }
            return next;
          });
        })
        .catch(() => {
          todo.forEach((u) => requestedRef.current.delete(u));
        });
    },
    [viewerDid],
  );

  const setOne = useCallback((uri: string, patch: Partial<Engagement>) => {
    setEngagement((prev) => {
      const next = new Map(prev);
      next.set(uri, { ...(prev.get(uri) ?? emptyEngagement()), ...patch });
      return next;
    });
  }, []);

  const toggleLike = useCallback(
    async (uri: string) => {
      const current = engagement.get(uri) ?? emptyEngagement();
      if (current.viewerLikeUri) {
        const likeUri = current.viewerLikeUri;
        setOne(uri, { likeCount: Math.max(0, current.likeCount - 1), viewerLikeUri: null });
        try {
          if (likeUri !== "optimistic") await deleteFeedLike(rkeyOf(likeUri));
        } catch (error) {
          setOne(uri, { likeCount: current.likeCount, viewerLikeUri: likeUri });
          throw error;
        }
        return;
      }
      setOne(uri, { likeCount: current.likeCount + 1, viewerLikeUri: "optimistic" });
      try {
        const result = await createFeedLike(uri);
        setOne(uri, { viewerLikeUri: result.uri });
      } catch (error) {
        setOne(uri, { likeCount: current.likeCount, viewerLikeUri: null });
        throw error;
      }
    },
    [engagement, setOne],
  );

  const getComments = useCallback((uri: string) => comments.get(uri), [comments]);

  const loadComments = useCallback(async (uri: string) => {
    const fetched = await fetchComments(uri);
    setComments((prev) => {
      const existing = prev.get(uri) ?? [];
      const seen = new Set(fetched.map((c) => c.uri));
      // Keep optimistic comments the indexer hasn't surfaced yet.
      const pending = existing.filter((c) => !seen.has(c.uri));
      const next = new Map(prev);
      next.set(uri, [...fetched, ...pending]);
      return next;
    });
  }, []);

  const addComment = useCallback(
    async (uri: string, text: string) => {
      const result = await createFeedComment({ text, subjectUri: uri });
      const optimistic: FeedComment = {
        uri: result.uri,
        did: viewerDid ?? "",
        text: text.trim(),
        createdAt: new Date().toISOString(),
        authorName: null,
        authorAvatarRef: null,
      };
      setComments((prev) => {
        const next = new Map(prev);
        next.set(uri, [...(prev.get(uri) ?? []), optimistic]);
        return next;
      });
      const current = engagement.get(uri) ?? emptyEngagement();
      setOne(uri, { commentCount: current.commentCount + 1 });
    },
    [engagement, setOne, viewerDid],
  );

  const addPost = useCallback(async (text: string) => {
    const result = await createFeedPost({ text });
    setLocalPosts((prev) => [{ id: result.uri, text: text.trim(), createdAt: new Date().toISOString() }, ...prev]);
  }, []);

  return {
    viewerDid,
    getEngagement,
    loadEngagement,
    toggleLike,
    getComments,
    loadComments,
    addComment,
    localPosts,
    addPost,
  };
}

// ── The viewer's own just-published posts (optimistic, above the timeline) ───

export function LocalPostsList({ posts, viewerDid }: { posts: LocalPost[]; viewerDid: string | null }) {
  const t = useTranslations("common.feed");
  const viewer = useViewerCard(viewerDid);
  if (posts.length === 0) return null;
  return (
    <ol className="relative">
      {posts.map((post) => (
        <li key={post.id} className="relative border-b border-border/50">
          <div className="flex gap-3 rounded-2xl px-3 py-3.5">
            <ResolvedAvatar
              did={viewerDid}
              imageUrl={viewer.avatarUrl}
              name={viewer.name}
              fallbackIcon={<UserIcon className="size-4" />}
              className="mt-0.5 size-10"
              sizes="40px"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="truncate font-medium text-foreground">{t("actions.you")}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="shrink-0 text-xs text-muted-foreground/80">{t("actions.postedJustNow")}</span>
                <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {t("composer.postedTitle")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{post.text}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Composer (publish a post) ────────────────────────────────────────────────

export function FeedComposer({
  signedIn,
  viewerDid,
  onPost,
}: {
  signedIn: boolean;
  viewerDid: string | null;
  onPost: (text: string) => Promise<void>;
}) {
  const t = useTranslations("common.feed");
  const viewer = useViewerCard(viewerDid);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const remaining = POST_MAX - text.length;
  const nearLimit = remaining <= 40;
  const canPost = signedIn && text.trim().length > 0 && remaining >= 0 && !busy;

  async function submit() {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      await onPost(text.trim());
      setText("");
      setPosted(true);
      window.setTimeout(() => setPosted(false), 6000);
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors focus-within:border-primary/40">
      <div className="flex gap-3">
        <ResolvedAvatar
          did={viewerDid}
          imageUrl={viewer.avatarUrl}
          name={viewer.name}
          fallbackIcon={<UserIcon className="size-4" />}
          className="mt-0.5 size-9"
          sizes="36px"
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPosted(false);
          }}
          onFocus={() => {
            if (!signedIn) redirectToLogin();
          }}
          rows={2}
          maxLength={POST_MAX + 40}
          placeholder={signedIn ? t("composer.placeholder") : t("composer.signedOut")}
          aria-label={t("composer.placeholder")}
          className="min-h-[3rem] flex-1 resize-none bg-transparent pt-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-12">
        <div className="flex min-w-0 items-center gap-1">
          {signedIn && viewerDid ? <ComposerObservationButton sessionDid={viewerDid} /> : null}
          <span className="truncate text-xs text-muted-foreground/70">
            {posted ? t("composer.postedNote") : signedIn ? "" : t("actions.signInToInteract")}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {text.length > 0 ? (
            <span
              className={cn(
                "text-xs tabular-nums",
                remaining < 0 ? "text-destructive" : nearLimit ? "text-amber-500" : "text-muted-foreground/70",
              )}
            >
              {remaining}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={signedIn ? !canPost : false}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {busy ? t("composer.posting") : t("composer.post")}
          </button>
        </div>
      </div>
      {error ? <p className="mt-1 pl-12 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Image button in the composer that opens the quick add-a-sighting flow. */
function ComposerObservationButton({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.feed");
  const openAddObservations = useAddObservations(sessionDid);
  return (
    <button
      type="button"
      onClick={openAddObservations}
      aria-label={t("composer.addObservation")}
      title={t("composer.addObservation")}
      className="-ml-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
    >
      <ImageIcon className="size-5" />
    </button>
  );
}

// ── Per-row action bar (like + comment) ──────────────────────────────────────

export function FeedActionBar({
  subjectUri,
  signedIn,
  interactions,
}: {
  subjectUri: string;
  signedIn: boolean;
  interactions: FeedInteractions;
}) {
  const t = useTranslations("common.feed");
  const engagement = interactions.getEngagement(subjectUri);
  const liked = Boolean(engagement.viewerLikeUri);
  const [open, setOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLike() {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    setError(null);
    try {
      await interactions.toggleLike(subjectUri);
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setLikeBusy(false);
    }
  }

  function onCommentClick() {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    setOpen((v) => !v);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        <button
          type="button"
          onClick={() => void onLike()}
          aria-pressed={liked}
          aria-label={liked ? t("actions.liked") : t("actions.like")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted",
            liked ? "text-rose-500" : "hover:text-foreground",
          )}
        >
          <HeartIcon className={cn("size-4", liked && "fill-current")} />
          <span className="tabular-nums">{engagement.likeCount > 0 ? engagement.likeCount : t("actions.like")}</span>
        </button>
        <button
          type="button"
          onClick={onCommentClick}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageCircleIcon className="size-4" />
          <span className="tabular-nums">
            {engagement.commentCount > 0 ? engagement.commentCount : t("actions.comment")}
          </span>
        </button>
      </div>

      {error ? <p className="px-2.5 pt-1 text-xs text-destructive">{error}</p> : null}

      {open ? (
        <CommentPanel
          subjectUri={subjectUri}
          viewerDid={interactions.viewerDid}
          comments={interactions.getComments(subjectUri)}
          loadComments={interactions.loadComments}
          onSubmit={(text) => interactions.addComment(subjectUri, text)}
        />
      ) : null}
    </div>
  );
}

function CommentPanel({
  subjectUri,
  viewerDid,
  comments,
  loadComments,
  onSubmit,
}: {
  subjectUri: string;
  viewerDid: string | null;
  comments: FeedComment[] | undefined;
  loadComments: (uri: string) => Promise<void>;
  onSubmit: (text: string) => Promise<void>;
}) {
  const t = useTranslations("common.feed");
  const viewer = useViewerCard(viewerDid);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(comments === undefined);

  // Fetch the thread the first time the panel opens for this subject.
  useEffect(() => {
    if (comments !== undefined) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void loadComments(subjectUri).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectUri]);

  const canSend = text.trim().length > 0 && text.length <= COMMENT_MAX && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      setText("");
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const list = comments ?? [];

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/30 p-2.5">
      {loading && list.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground/70">{t("actions.loadingComments")}</p>
      ) : list.length > 0 ? (
        <ul className="mb-2 space-y-2.5">
          {list.map((c) => {
            const isYou = Boolean(viewerDid && c.did === viewerDid);
            const name = isYou ? t("actions.you") : c.authorName || t("anonymous");
            return (
              <li key={c.uri} className="flex gap-2">
                <ResolvedAvatar
                  did={c.did}
                  avatarRef={isYou ? null : c.authorAvatarRef}
                  imageUrl={isYou ? viewer.avatarUrl : null}
                  name={isYou ? viewer.name ?? name : name}
                  fallbackIcon={<UserIcon className="size-3.5" />}
                  className="mt-0.5 size-7"
                  sizes="28px"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-foreground">{name}</span>{" "}
                  <span className="text-xs text-muted-foreground/70">
                    {c.createdAt ? formatRelative(c.createdAt) : t("actions.postedJustNow")}
                  </span>
                  <p className="whitespace-pre-wrap break-words text-foreground/90">{c.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground/70">{t("actions.noComments")}</p>
      )}
      <div className="flex items-end gap-2">
        <ResolvedAvatar
          did={viewerDid}
          imageUrl={viewer.avatarUrl}
          name={viewer.name}
          fallbackIcon={<UserIcon className="size-3.5" />}
          className="size-7"
          sizes="28px"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          maxLength={COMMENT_MAX + 40}
          placeholder={t("actions.commentPlaceholder")}
          aria-label={t("actions.commentPlaceholder")}
          className="min-h-9 flex-1 resize-none rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label={t("actions.send")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SendHorizonalIcon className="size-4" />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
