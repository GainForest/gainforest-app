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

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EyeOffIcon, HeartIcon, ImageIcon, Loader2Icon, MessageCircleIcon, PencilIcon, ReplyIcon, SendHorizonalIcon, Trash2Icon, UserIcon, XIcon } from "lucide-react";
import {
  createFeedComment,
  createFeedLike,
  createFeedPost,
  deleteFeedLike,
  deleteFeedPost,
  updateFeedPost,
} from "@/app/(manage)/manage/_lib/mutations";
import {
  buildCommentTree,
  emptyEngagement,
  fetchComments,
  fetchEngagement,
  fetchLikers,
  type CommentTreeNode,
  type Engagement,
  type FeedComment,
  type Liker,
} from "@/app/_lib/feed-engagement";
import { redirectToLogin } from "@/app/_lib/auth-client";
import { buildMentionFacets, type MentionCandidate } from "@/app/_lib/mentions";
import { MentionText } from "@/app/_components/MentionText";
import { MentionTextarea } from "@/app/_components/MentionTextarea";
import {
  crosspostToBluesky,
  deleteBlueskyTwin,
  ensureBlueskyProfile,
  hasBlueskyProfile,
  readBlueskyCrosspostPref,
  saveBlueskyCrosspostPref,
  updateBlueskyTwin,
  type BlueskyCrosspostPref,
} from "@/app/_lib/bluesky-crosspost";
import { BlueskyConsentModal } from "@/app/_components/BlueskyConsentModal";
import { BlueskyIcon } from "@/app/_components/BlueskyIcon";
import { formatRelative } from "@/app/_lib/format";
import { useAccountList, useActiveAccountContext } from "@/app/_lib/account-switcher";
import { useAddObservations } from "@/app/_components/useAddObservations";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModalPortal, useModal } from "@/components/ui/modal/context";
import { ModalTitle } from "@/components/ui/modal/modal";
import { ResolvedAvatar } from "./ResolvedAvatar";

/** Which account the viewer is currently acting as in the feed. When the
 *  account switcher is set to a personal context this is the signed-in user; when
 *  it's set to an organization the viewer manages, writes (posts, comments,
 *  likes) are made on behalf of that organization's repo. `repo` is the group
 *  DID for a group context (passed to the mutation helpers so they route through
 *  CGS, which enforces membership) and undefined for the personal repo. */
type ActingAccount = {
  sessionDid: string | null;
  /** DID whose repo writes land in and whose like state the feed reflects. */
  actingDid: string | null;
  /** Group DID when acting as an organization; undefined for the personal repo. */
  repo: string | undefined;
  isGroup: boolean;
  card: { name: string | null; avatarUrl: string | null };
};

function useActingAccount(sessionDid: string | null): ActingAccount {
  const { personal, groups } = useAccountList(sessionDid);
  const [activeContext] = useActiveAccountContext(sessionDid ?? "");

  if (!sessionDid) {
    return { sessionDid: null, actingDid: null, repo: undefined, isGroup: false, card: { name: null, avatarUrl: null } };
  }
  if (activeContext.type === "group" && activeContext.did) {
    const group = groups.find((g) => g.groupDid === activeContext.did) ?? null;
    return {
      sessionDid,
      actingDid: activeContext.did,
      repo: activeContext.did,
      isGroup: true,
      card: { name: group?.displayName?.trim() || null, avatarUrl: group?.avatarUrl ?? null },
    };
  }
  return {
    sessionDid,
    actingDid: sessionDid,
    repo: undefined,
    isGroup: false,
    card: { name: personal?.displayName?.trim() || null, avatarUrl: personal?.avatarUrl ?? null },
  };
}

/** The display name + avatar (and DID) of the account the viewer is acting as,
 *  for the composer and comment identity. */
function useViewerCard(sessionDid: string | null): { name: string | null; avatarUrl: string | null; did: string | null } {
  const acting = useActingAccount(sessionDid);
  return { name: acting.card.name, avatarUrl: acting.card.avatarUrl, did: acting.actingDid };
}

export type LocalPost = {
  id: string;
  text: string;
  createdAt: string;
  /** Accounts @-mentioned in the text, for linkified rendering. */
  mentions?: MentionCandidate[];
  /** bsky.app URL of the Bluesky twin when this post was cross-posted. */
  bskyUrl?: string | null;
};

type LikersState = { status: "idle" | "loading" | "ready"; likers: Liker[] };

export type FeedInteractions = {
  /** The signed-in user's DID (used to resolve the account switcher). */
  sessionDid: string | null;
  /** The DID writes are made on behalf of — personal or the active org. */
  viewerDid: string | null;
  getEngagement: (uri: string) => Engagement;
  loadEngagement: (uris: string[]) => void;
  toggleLike: (uri: string) => Promise<void>;
  getLikers: (uri: string) => LikersState;
  loadLikers: (uri: string) => void;
  getComments: (uri: string) => FeedComment[] | undefined;
  loadComments: (uri: string) => Promise<void>;
  /** Comment on `uri`, or reply to it within a thread. Pass `rootUri` (the
   *  subject at the top of the thread) to make this a threaded reply; omit it
   *  for a top-level comment. The optimistic comment lands in the thread keyed
   *  by the root so it nests under what it answers. `mentions` are the accounts
   *  the author @-tagged (facets are computed from them at write time). */
  addComment: (uri: string, text: string, rootUri?: string, mentions?: MentionCandidate[]) => Promise<void>;
  /** Edit one of the viewer's own comments under `subjectUri`. */
  editComment: (subjectUri: string, commentUri: string, text: string, mentions?: MentionCandidate[]) => Promise<void>;
  /** Delete one of the viewer's own comments under `subjectUri`. */
  deleteComment: (subjectUri: string, commentUri: string) => Promise<void>;
  localPosts: LocalPost[];
  /** Publish a top-level post. `crosspost` additionally writes the
   *  app.bsky.feed.post twin (personal repo only; ignored for group repos). */
  addPost: (text: string, opts?: { crosspost?: boolean; mentions?: MentionCandidate[] }) => Promise<void>;
  /** Edit one of the viewer's own feed posts (optimistic local + persisted). */
  editPost: (postUri: string, text: string, mentions?: MentionCandidate[]) => Promise<void>;
  /** Delete one of the viewer's own feed posts (optimistic local + persisted). */
  deletePost: (postUri: string) => Promise<void>;
  /** AT-URIs the viewer has just deleted, so the timeline can hide them until
   *  the indexer stops returning them. */
  removedUris: Set<string>;
};

const EMPTY_LIKERS: LikersState = { status: "idle", likers: [] };

const POST_MAX = 300;
const COMMENT_MAX = 1000;

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** Indexer-backed engagement state with optimistic overlays for the viewer's
 *  own writes. Writes are routed to the account the viewer is acting as (their
 *  personal repo, or an organization they manage when the account switcher is
 *  set to it), and the like state reflects that same account. */
export function useFeedInteractions(sessionDid: string | null): FeedInteractions {
  const acting = useActingAccount(sessionDid);
  const actingDid = acting.actingDid;
  const repo = acting.repo;
  // Stable per-repo option object so the write callbacks below don't change
  // identity every render (and so exhaustive-deps stays satisfied).
  const repoOption = useMemo(() => (repo ? { repo } : undefined), [repo]);

  const [engagement, setEngagement] = useState<Map<string, Engagement>>(() => new Map());
  const [comments, setComments] = useState<Map<string, FeedComment[]>>(() => new Map());
  const [likers, setLikers] = useState<Map<string, LikersState>>(() => new Map());
  const [localPosts, setLocalPosts] = useState<LocalPost[]>([]);
  // AT-URIs the viewer just deleted, hidden from the timeline until the indexer
  // catches up and stops returning them.
  const [removedUris, setRemovedUris] = useState<Set<string>>(() => new Set());
  // URIs whose engagement has been requested already (avoids refetch storms).
  const requestedRef = useRef<Set<string>>(new Set());
  // URIs whose likers have been requested already (avoids refetch storms).
  const likersRequestedRef = useRef<Set<string>>(new Set());

  // Reset everything when the acting account changes (sign in / out, or an
  // account switch). Engagement + like state are identity-specific, and any
  // optimistic overlays belong to the previous account, so they're cleared and
  // re-fetched for the new identity.
  useEffect(() => {
    requestedRef.current = new Set();
    likersRequestedRef.current = new Set();
    setEngagement(new Map());
    setComments(new Map());
    setLikers(new Map());
    setLocalPosts([]);
    setRemovedUris(new Set());
  }, [actingDid]);

  const getEngagement = useCallback(
    (uri: string): Engagement => engagement.get(uri) ?? emptyEngagement(),
    [engagement],
  );

  const loadEngagement = useCallback(
    (uris: string[]) => {
      const todo = uris.filter((u) => u && u.startsWith("at://") && !requestedRef.current.has(u));
      if (todo.length === 0) return;
      todo.forEach((u) => requestedRef.current.add(u));
      void fetchEngagement(todo, actingDid)
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
    [actingDid],
  );

  const setOne = useCallback((uri: string, patch: Partial<Engagement>) => {
    setEngagement((prev) => {
      const next = new Map(prev);
      next.set(uri, { ...(prev.get(uri) ?? emptyEngagement()), ...patch });
      return next;
    });
  }, []);

  // Optimistically add/remove the viewer from a subject's likers list so the
  // hover card reflects the viewer's own like immediately; the next lazy fetch
  // reconciles names/order once the indexer catches up.
  const patchViewerLiker = useCallback(
    (uri: string, liked: boolean) => {
      if (!actingDid) return;
      likersRequestedRef.current.delete(uri); // allow a fresh reconcile on next hover
      setLikers((prev) => {
        const existing = prev.get(uri);
        if (!existing) return prev;
        const without = existing.likers.filter((l) => l.did !== actingDid);
        const nextLikers = liked
          ? [{ did: actingDid, name: null, avatarRef: null }, ...without]
          : without;
        const next = new Map(prev);
        next.set(uri, { ...existing, likers: nextLikers });
        return next;
      });
    },
    [actingDid],
  );

  const toggleLike = useCallback(
    async (uri: string) => {
      const current = engagement.get(uri) ?? emptyEngagement();
      if (current.viewerLikeUri) {
        const likeUri = current.viewerLikeUri;
        setOne(uri, { likeCount: Math.max(0, current.likeCount - 1), viewerLikeUri: null });
        patchViewerLiker(uri, false);
        try {
          if (likeUri !== "optimistic") await deleteFeedLike(rkeyOf(likeUri), repoOption);
        } catch (error) {
          setOne(uri, { likeCount: current.likeCount, viewerLikeUri: likeUri });
          patchViewerLiker(uri, true);
          throw error;
        }
        return;
      }
      setOne(uri, { likeCount: current.likeCount + 1, viewerLikeUri: "optimistic" });
      patchViewerLiker(uri, true);
      try {
        const result = await createFeedLike(uri, repoOption);
        setOne(uri, { viewerLikeUri: result.uri });
      } catch (error) {
        setOne(uri, { likeCount: current.likeCount, viewerLikeUri: null });
        patchViewerLiker(uri, false);
        throw error;
      }
    },
    [engagement, setOne, patchViewerLiker, repoOption],
  );

  const getLikers = useCallback((uri: string): LikersState => likers.get(uri) ?? EMPTY_LIKERS, [likers]);

  // Lazily load (once) the accounts that liked a subject, for the hover card.
  const loadLikers = useCallback((uri: string) => {
    if (!uri.startsWith("at://") || likersRequestedRef.current.has(uri)) return;
    likersRequestedRef.current.add(uri);
    setLikers((prev) => {
      const next = new Map(prev);
      next.set(uri, { status: "loading", likers: prev.get(uri)?.likers ?? [] });
      return next;
    });
    void fetchLikers(uri)
      .then((list) => {
        setLikers((prev) => {
          const next = new Map(prev);
          next.set(uri, { status: "ready", likers: list });
          return next;
        });
      })
      .catch(() => {
        likersRequestedRef.current.delete(uri);
        setLikers((prev) => {
          const next = new Map(prev);
          next.set(uri, { status: "idle", likers: prev.get(uri)?.likers ?? [] });
          return next;
        });
      });
  }, []);

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
    async (uri: string, text: string, rootUri?: string, mentions?: MentionCandidate[]) => {
      // A reply targets the comment (`uri`) as its parent but lives in the
      // thread keyed by the subject at the top (`rootUri`). A top-level comment
      // is its own root, so the thread key is just `uri`.
      const threadKey = rootUri ?? uri;
      const facets = buildMentionFacets(text.trim(), mentions ?? []);
      const result = await createFeedComment({ text, subjectUri: uri, rootUri, facets }, repoOption);
      const optimistic: FeedComment = {
        uri: result.uri,
        did: actingDid ?? "",
        text: text.trim(),
        createdAt: new Date().toISOString(),
        authorName: null,
        authorAvatarRef: null,
        parentUri: uri,
        mentions: mentions ?? [],
      };
      setComments((prev) => {
        const next = new Map(prev);
        next.set(threadKey, [...(prev.get(threadKey) ?? []), optimistic]);
        return next;
      });
      const current = engagement.get(threadKey) ?? emptyEngagement();
      setOne(threadKey, { commentCount: current.commentCount + 1 });
    },
    [engagement, setOne, actingDid, repoOption],
  );

  // Edit one of the viewer's own comments. Gating is the caller's job (only the
  // author sees the affordance), so the acting repo already matches the owner.
  const editComment = useCallback(
    async (subjectUri: string, commentUri: string, text: string, mentions?: MentionCandidate[]) => {
      const trimmed = text.trim();
      const facets = buildMentionFacets(trimmed, mentions ?? []);
      await updateFeedPost(rkeyOf(commentUri), trimmed, { ...repoOption, facets });
      setComments((prev) => {
        const list = prev.get(subjectUri);
        if (!list) return prev;
        const next = new Map(prev);
        next.set(
          subjectUri,
          list.map((c) => (c.uri === commentUri ? { ...c, text: trimmed, mentions: mentions ?? [] } : c)),
        );
        return next;
      });
    },
    [repoOption],
  );

  const addPost = useCallback(
    async (text: string, opts?: { crosspost?: boolean; mentions?: MentionCandidate[] }) => {
      const facets = buildMentionFacets(text.trim(), opts?.mentions ?? []);
      const result = await createFeedPost({ text, facets }, repoOption);
      // Bluesky twin: opt-in, personal repo only, top-level posts only. The
      // GainForest post is already live at this point, so a failed twin write
      // just means no Bluesky link — never a failed post.
      let bskyUrl: string | null = null;
      if (opts?.crosspost && !repoOption && actingDid) {
        bskyUrl = await crosspostToBluesky({ did: actingDid, rkey: result.rkey, text: text.trim() });
      }
      setLocalPosts((prev) => [
        { id: result.uri, text: text.trim(), createdAt: new Date().toISOString(), mentions: opts?.mentions ?? [], bskyUrl },
        ...prev,
      ]);
    },
    [repoOption, actingDid],
  );

  // Edit one of the viewer's own posts. Updates the optimistic local copy if it
  // is still showing; the persisted edit reconciles on the next feed load.
  const editPost = useCallback(
    async (postUri: string, text: string, mentions?: MentionCandidate[]) => {
      const trimmed = text.trim();
      const facets = buildMentionFacets(trimmed, mentions ?? []);
      await updateFeedPost(rkeyOf(postUri), trimmed, { ...repoOption, facets });
      // Keep an existing Bluesky twin's record in sync (best-effort, personal
      // repo only; a no-op when the post was never cross-posted).
      if (!repoOption) void updateBlueskyTwin(rkeyOf(postUri), trimmed);
      setLocalPosts((prev) => prev.map((p) => (p.id === postUri ? { ...p, text: trimmed, mentions: mentions ?? [] } : p)));
    },
    [repoOption],
  );

  // Delete one of the viewer's own posts. Gating is the caller's job (only the
  // author sees the affordance), so the acting repo already owns the record.
  // Drops the optimistic local copy and marks the URI removed so a real feed
  // row for it is hidden until the indexer stops returning it.
  const deletePost = useCallback(
    async (postUri: string) => {
      await deleteFeedPost(rkeyOf(postUri), repoOption);
      // Deleting a post also deletes its Bluesky twin when one exists
      // (best-effort, personal repo only) so nothing orphaned stays public.
      if (!repoOption) void deleteBlueskyTwin(rkeyOf(postUri));
      setLocalPosts((prev) => prev.filter((p) => p.id !== postUri));
      setRemovedUris((prev) => new Set(prev).add(postUri));
    },
    [repoOption],
  );

  // Delete one of the viewer's own comments (a reply-post). Removes it from the
  // loaded thread and decrements the subject's comment count optimistically.
  const deleteComment = useCallback(
    async (subjectUri: string, commentUri: string) => {
      await deleteFeedPost(rkeyOf(commentUri), repoOption);
      setComments((prev) => {
        const list = prev.get(subjectUri);
        if (!list) return prev;
        const next = new Map(prev);
        next.set(subjectUri, list.filter((c) => c.uri !== commentUri));
        return next;
      });
      setRemovedUris((prev) => new Set(prev).add(commentUri));
      const current = engagement.get(subjectUri) ?? emptyEngagement();
      setOne(subjectUri, { commentCount: Math.max(0, current.commentCount - 1) });
    },
    [repoOption, engagement, setOne],
  );

  return {
    sessionDid,
    viewerDid: actingDid,
    getEngagement,
    loadEngagement,
    toggleLike,
    getLikers,
    loadLikers,
    getComments,
    loadComments,
    addComment,
    editComment,
    deleteComment,
    localPosts,
    addPost,
    editPost,
    deletePost,
    removedUris,
  };
}

// ── The viewer's own just-published posts (optimistic, above the timeline) ───

/** Small "view this post on Bluesky" link rendered under cross-posted feed
 *  posts — both the optimistic just-posted rows and indexed timeline rows. */
export function BlueskyPostLink({ href }: { href: string }) {
  const tb = useTranslations("common.bluesky");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1 inline-flex items-center gap-1 rounded-full text-xs font-medium text-[#1185fe] hover:underline"
    >
      <BlueskyIcon className="size-3" />
      {tb("viewPost")}
    </a>
  );
}

export function LocalPostsList({
  posts,
  viewerDid,
  onEditPost,
  onDeletePost,
}: {
  posts: LocalPost[];
  viewerDid: string | null;
  onEditPost?: (postUri: string, text: string, mentions?: MentionCandidate[]) => Promise<void>;
  onDeletePost?: (postUri: string) => Promise<void>;
}) {
  const t = useTranslations("common.feed");
  const viewer = useViewerCard(viewerDid);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (posts.length === 0) return null;
  return (
    <ol className="relative">
      {posts.map((post) => (
        <li key={post.id} className="relative border-b border-border/50">
          <div className="flex gap-3 rounded-2xl px-3 py-3.5">
            <ResolvedAvatar
              did={viewer.did}
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
              {editingId === post.id && onEditPost ? (
                <InlineEditor
                  initial={post.text}
                  initialMentions={post.mentions}
                  max={POST_MAX}
                  onSave={(text, mentions) => onEditPost(post.id, text, mentions)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                    <MentionText text={post.text} mentions={post.mentions} />
                  </p>
                  {post.bskyUrl ? <BlueskyPostLink href={post.bskyUrl} /> : null}
                  {onEditPost || onDeletePost ? (
                    <div className="mt-1 flex items-center gap-1">
                      {onEditPost ? (
                        <button
                          type="button"
                          onClick={() => setEditingId(post.id)}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <PencilIcon className="size-3" />
                          {t("actions.edit")}
                        </button>
                      ) : null}
                      {onDeletePost ? <DeleteButton onDelete={() => onDeletePost(post.id)} /> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Inline text editor used to edit a post or comment in place. Saves the
 *  trimmed text when changed; Escape or Cancel discards. `initialMentions`
 *  seeds the accounts already tagged in the text so an edit keeps existing
 *  @-mentions linked; new ones can be added through the type-ahead. */
export function InlineEditor({
  initial,
  initialMentions,
  max,
  onSave,
  onCancel,
}: {
  initial: string;
  initialMentions?: MentionCandidate[];
  max: number;
  onSave: (text: string, mentions: MentionCandidate[]) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("common.feed");
  const [text, setText] = useState(initial);
  const [mentions, setMentions] = useState<MentionCandidate[]>(initialMentions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();
  const canSave = trimmed.length > 0 && text.length <= max && !busy && trimmed !== initial.trim();

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed, mentions);
      onCancel();
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <MentionTextarea
        value={text}
        autoFocus
        onValueChange={setText}
        onPickMention={(c) => setMentions((prev) => [...prev, c])}
        onEscape={onCancel}
        rows={2}
        maxLength={max + 40}
        ariaLabel={t("actions.edit")}
        className="resize-none rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
          {t("actions.saveEdit")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("actions.cancelEdit")}
        </button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}

/** The "Reply" affordance under a comment. Signed-out viewers are sent to login
 *  (mirroring the like button) so the action stays discoverable but only acts
 *  when permitted; signed-in viewers open the inline reply composer. */
export function ReplyToggle({ signedIn, onOpen }: { signedIn: boolean; onOpen: () => void }) {
  const t = useTranslations("common.feed");
  return (
    <button
      type="button"
      onClick={() => (signedIn ? onOpen() : redirectToLogin())}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ReplyIcon className="size-3" />
      {t("actions.reply")}
    </button>
  );
}

/** Inline composer for replying to a comment inside a thread. Styled like the
 *  comment box; submits the reply and closes itself on success. The caller wires
 *  `onSubmit` to addComment(parentUri, text, rootUri) so it nests correctly. */
export function ReplyComposer({
  viewerDid,
  onSubmit,
  onCancel,
}: {
  viewerDid: string | null;
  onSubmit: (text: string, mentions: MentionCandidate[]) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("common.feed");
  const viewer = useViewerCard(viewerDid);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<MentionCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = text.trim().length > 0 && text.length <= COMMENT_MAX && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim(), mentions);
      setText("");
      setMentions([]);
      onCancel();
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex items-end gap-2">
      <ResolvedAvatar
        did={viewer.did}
        imageUrl={viewer.avatarUrl}
        name={viewer.name}
        fallbackIcon={<UserIcon className="size-3" />}
        className="size-6"
        sizes="24px"
      />
      <div className="min-w-0 flex-1">
        <MentionTextarea
          value={text}
          autoFocus
          onValueChange={setText}
          onPickMention={(c) => setMentions((prev) => [...prev, c])}
          onEscape={onCancel}
          rows={1}
          maxLength={COMMENT_MAX + 40}
          placeholder={t("actions.replyPlaceholder")}
          ariaLabel={t("actions.replyPlaceholder")}
          className="min-h-8 resize-none rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            {t("actions.reply")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("actions.cancelEdit")}
          </button>
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
        </div>
      </div>
    </div>
  );
}

/** A small two-step delete control, shared by posts and comments. The first
 *  click reveals an explicit "confirm / cancel" pair so a delete can't fire by
 *  accident; `onDelete` removes the record and the surrounding row disappears. */
export function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const t = useTranslations("common.feed");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onDelete();
      // The row unmounts on success; nothing more to do here.
    } catch {
      setError(true);
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          {busy ? <Loader2Icon className="size-3 animate-spin" /> : <Trash2Icon className="size-3" />}
          {t("actions.confirmDelete")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {t("actions.cancelDelete")}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2Icon className="size-3" />
        {t("actions.delete")}
      </button>
      {error ? <span className="text-[11px] text-destructive">{t("actions.errorGeneric")}</span> : null}
    </span>
  );
}

/** Steward-only control on a feed row: hide the underlying record from the
 *  public feed and catalogs by flagging it as a test record. Two-step confirm
 *  like DeleteButton; on success the row is removed via `onHidden`. */
export function ModeratorHideButton({ subjectUri, onHidden }: { subjectUri: string; onHidden: () => void }) {
  const t = useTranslations("common.testRecord");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/internal/test-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri: subjectUri }),
      });
      const data = (await response.json().catch(() => null)) as { flagged?: boolean; error?: string } | null;
      if (!response.ok || !data || data.error) throw new Error(data?.error || "flag failed");
      onHidden();
    } catch {
      setError(true);
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          {busy ? <Loader2Icon className="size-3 animate-spin" /> : <EyeOffIcon className="size-3" />}
          {t("confirmHide")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title={t("hideHint")}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
      >
        <EyeOffIcon className="size-3" />
        {t("hideAction")}
      </button>
      {error ? <span className="text-[11px] text-destructive">{t("genericError")}</span> : null}
    </span>
  );
}

// ── Composer (publish a post) ────────────────────────────────────────────────

export function FeedComposer({
  signedIn,
  viewerDid,
  onPost,
  embedded = false,
  autoFocus = false,
  onAddPhoto,
  draftText,
  onDraftChange,
  draftMentions,
  onDraftMentionsChange,
}: {
  signedIn: boolean;
  viewerDid: string | null;
  onPost: (text: string, opts?: { crosspost?: boolean; mentions?: MentionCandidate[] }) => Promise<void>;
  /** Drop the standalone card chrome (border/background/margin) so the composer
   *  can sit inside another container, e.g. the phone composer modal. */
  embedded?: boolean;
  /** Focus the textarea on mount (used when opened in the modal). */
  autoFocus?: boolean;
  /** Override the photo button's action. When set, the composer does NOT own
   *  the add-a-sighting modal itself (its own modal can't be nested inside the
   *  phone composer modal — same global stack); the caller opens that flow at a
   *  stable location instead. When omitted, the composer renders its own button. */
  onAddPhoto?: () => void;
  /** Lift the draft up so it survives the composer being remounted — the phone
   *  composer modal is replaced when the sighting uploader opens, and this keeps
   *  a half-written post intact when the user comes back. Controlled pair. */
  draftText?: string;
  onDraftChange?: (text: string) => void;
  /** Controlled pair for the draft's picked @-mentions, lifted alongside the
   *  draft text so tags survive the composer being remounted. */
  draftMentions?: MentionCandidate[];
  onDraftMentionsChange?: (mentions: MentionCandidate[]) => void;
}) {
  const t = useTranslations("common.feed");
  const tb = useTranslations("common.bluesky");
  const acting = useActingAccount(viewerDid);
  const [internalText, setInternalText] = useState("");
  const [internalMentions, setInternalMentions] = useState<MentionCandidate[]>([]);
  const text = draftText ?? internalText;
  const setText = onDraftChange ?? setInternalText;
  const mentions = draftMentions ?? internalMentions;
  const setMentions = onDraftMentionsChange ?? setInternalMentions;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // ── Bluesky cross-posting (opt-in, personal repo only) ──────────────────
  // The preference is a singleton on the user's PDS; the first activation is
  // gated by an explicit consent modal (see BlueskyConsentModal). Groups never
  // cross-post — the chip is hidden while acting as an organization.
  const personalDid = signedIn && !acting.isGroup ? acting.actingDid : null;
  const [bskyPref, setBskyPref] = useState<BlueskyCrosspostPref | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  // Whether the account already HAS an app.bsky.actor.profile (null = unknown);
  // inverted into the modal's `needsProfile` prop below.
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    setBskyPref(null);
    if (!personalDid) return;
    let cancelled = false;
    void readBlueskyCrosspostPref(personalDid).then((pref) => {
      if (!cancelled) setBskyPref(pref);
    });
    return () => {
      cancelled = true;
    };
  }, [personalDid]);

  const crosspostOn = Boolean(personalDid && bskyPref?.enabled);

  async function toggleBluesky() {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    if (!personalDid || !bskyPref) return;
    if (!bskyPref.enabled && !bskyPref.consented) {
      // First activation: ask for consent before anything touches Bluesky.
      setHasProfile(null);
      void hasBlueskyProfile(personalDid).then(setHasProfile);
      setConsentOpen(true);
      return;
    }
    const previous = bskyPref;
    const next = { enabled: !bskyPref.enabled, consented: true };
    setBskyPref(next);
    try {
      await saveBlueskyCrosspostPref(personalDid, next.enabled);
    } catch {
      setBskyPref(previous);
    }
  }

  async function confirmBlueskyConsent() {
    if (!personalDid) return;
    // Consent given: bootstrap the Bluesky profile from the certified profile
    // when missing, then persist the opt-in.
    await ensureBlueskyProfile(personalDid);
    await saveBlueskyCrosspostPref(personalDid, true);
    setBskyPref({ enabled: true, consented: true });
  }

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
      await onPost(text.trim(), { crosspost: crosspostOn, mentions });
      setText("");
      setMentions([]);
      setPosted(true);
      window.setTimeout(() => setPosted(false), 6000);
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        embedded
          ? "w-full"
          : "mb-3 rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors focus-within:border-primary/40",
      )}
    >
      <div className="flex gap-3">
        <ResolvedAvatar
          did={acting.actingDid}
          imageUrl={acting.card.avatarUrl}
          name={acting.card.name}
          fallbackIcon={<UserIcon className="size-4" />}
          className="mt-0.5 size-9"
          sizes="36px"
        />
        <MentionTextarea
          autoFocus={autoFocus}
          value={text}
          onValueChange={(next) => {
            setText(next);
            setPosted(false);
          }}
          onPickMention={(c) => setMentions([...mentions, c])}
          onFocus={() => {
            if (!signedIn) redirectToLogin();
          }}
          rows={2}
          maxLength={POST_MAX + 40}
          placeholder={signedIn ? t("composer.placeholder") : t("composer.signedOut")}
          ariaLabel={t("composer.placeholder")}
          className={cn(
            "resize-none bg-transparent pt-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70",
            embedded ? "min-h-[8rem]" : "min-h-[3rem]",
          )}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-12">
        <div className="flex min-w-0 items-center gap-1">
          {signedIn && viewerDid ? (
            onAddPhoto ? (
              <button
                type="button"
                onClick={onAddPhoto}
                aria-label={t("composer.addObservation")}
                title={t("composer.addObservation")}
                className="-ml-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
              >
                <ImageIcon className="size-5" />
              </button>
            ) : (
              <ComposerObservationButton sessionDid={viewerDid} />
            )
          ) : null}
          {personalDid && bskyPref ? (
            <button
              type="button"
              onClick={() => void toggleBluesky()}
              aria-pressed={crosspostOn}
              aria-label={tb("toggle")}
              title={crosspostOn ? tb("onHint") : tb("offHint")}
              className={cn(
                "-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                crosspostOn
                  ? "text-[#1185fe] hover:bg-[#1185fe]/10"
                  : "text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
              )}
            >
              <BlueskyIcon className="size-[18px]" />
            </button>
          ) : null}
          <span className="truncate text-xs text-muted-foreground/70">
            {posted
              ? t("composer.postedNote")
              : !signedIn
                ? t("actions.signInToInteract")
                : acting.isGroup && acting.card.name
                  ? t("composer.postingAs", { name: acting.card.name })
                  : crosspostOn
                    ? tb("composerHint")
                    : ""}
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
      <BlueskyConsentModal
        open={consentOpen}
        needsProfile={hasProfile === null ? null : !hasProfile}
        onOpenChange={setConsentOpen}
        onConfirm={confirmBlueskyConsent}
      />
    </div>
  );
}

/**
 * Phone-only floating composer bar (hidden from sm up). A slim one-liner pinned
 * to the bottom of the viewport; tapping it opens the full FeedComposer in a
 * fullscreen modal (the shared modal architecture) so the feed timeline can
 * start at the top of the screen instead of below the inline composer card.
 */
export function MobileComposerBar({
  signedIn,
  viewerDid,
  onPost,
}: {
  signedIn: boolean;
  viewerDid: string | null;
  onPost: (text: string, opts?: { crosspost?: boolean; mentions?: MentionCandidate[] }) => Promise<void>;
}) {
  const t = useTranslations("common.feed");
  const acting = useActingAccount(viewerDid);
  const modal = useModal();
  const modalId = `feed-composer-${useId()}`;
  // Held here (not in the composer) so a half-written post survives the round
  // trip out to the sighting uploader and back.
  const [draft, setDraft] = useState("");
  const [draftMentions, setDraftMentions] = useState<MentionCandidate[]>([]);

  // The bar is fixed to the viewport bottom, so it would otherwise sit on top of
  // the page footer at the end of the feed. Watch the footer and slide the bar
  // (and its scrim) out of the way as it approaches, then bring it back on the
  // way up. rootMargin gives a head start so the slide finishes before overlap.
  const [footerNear, setFooterNear] = useState(false);
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(
      (entries) => setFooterNear(entries[0]?.isIntersecting ?? false),
      { rootMargin: "0px 0px 96px 0px" },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  // A drawer on phones (no fullscreenOnMobile → bottom sheet); a small centered
  // dialog on the narrow tablet band. replaceAll keeps exactly one modal on the
  // shared stack so its mode never fights the fullscreen sighting uploader.
  const openComposer = () => {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    modal.pushModal({ id: modalId, dialogWidth: "max-w-lg" }, true);
    void modal.show();
  };

  // The add-a-sighting flow is owned HERE (a stable spot in the feed tree), not
  // by the composer inside the modal: it's a fullscreen modal on the same single
  // global stack, so it can't be nested inside the composer modal — it would
  // unmount its own portal. Tapping the photo button swaps this composer out for
  // it (replaceAll); its back arrow (onBack) swaps back to the composer.
  const addObservations = useAddObservations(viewerDid ?? "", { onBack: openComposer });

  const closeComposer = () => {
    void modal.hide().then(() => modal.clear());
  };

  // Close the modal once the post lands; the optimistic row shows in the feed
  // behind it immediately.
  const handlePost = async (text: string, opts?: { crosspost?: boolean; mentions?: MentionCandidate[] }) => {
    await onPost(text, opts);
    closeComposer();
  };

  return (
    // Fixed (not sticky): the app shell is `h-screen` (100vh) with the feed
    // scrolling inside <main>, so on mobile <main>'s bottom sits below the
    // visible fold — a `sticky bottom-0` bar pins there and disappears. Fixed
    // pins to the visual viewport bottom, so it stays visible. `sm:hidden`
    // keeps it phone-only; the section's pb clears the last rows.
    <div className="sm:hidden">
      {/* A plain gradient scrim so the feed fades out under the bar. We do NOT
          use ProgressiveBlur here: stacked backdrop-filter layers over the
          scrolling image feed re-composite every frame and tank mobile perf.
          A gradient is essentially free and still separates the bar. */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-10 h-32 transition-transform duration-300",
          footerNear && "translate-y-full",
        )}
        style={{
          background:
            "linear-gradient(to top, var(--background) 0%, var(--background) 32%, transparent 100%)",
          opacity: 0.96,
        }}
      />
      {/* A detached floating island — side margins + a gap above the bottom edge
          and a shadow. Slides down + fades out as the footer arrives so it never
          overlaps it. */}
      <button
        type="button"
        onClick={openComposer}
        className={cn(
          // z-20 keeps the island above the scrolling feed but *below* the
          // sticky header (z-30) so its user menu / sign-out dropdown, which is
          // trapped in the header's stacking context, stays clickable on phones.
          "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-full border-2 border-primary bg-background/90 py-2 pl-2 pr-4 text-left shadow-lg backdrop-blur transition-[transform,opacity] duration-300 active:bg-muted supports-[backdrop-filter]:bg-background/80",
          footerNear && "pointer-events-none translate-y-[calc(100%+2rem)] opacity-0",
        )}
      >
        <ResolvedAvatar
          did={acting.actingDid}
          imageUrl={acting.card.avatarUrl}
          name={acting.card.name}
          fallbackIcon={<UserIcon className="size-4" />}
          className="size-8 shrink-0"
          sizes="32px"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground/80">
          {signedIn ? t("composer.placeholder") : t("composer.signedOut")}
        </span>
        <SendHorizonalIcon className="size-4 shrink-0 text-primary" />
      </button>
      <ModalPortal id={modalId}>
        {/* Not ModalContent on purpose: its built-in DialogClose can't reach the
            Radix Dialog context through the portal (content keeps the caller's
            tree) and it would throw. A plain wrapper also leaves the modal
            dismissible by default, so the drawer keeps its swipe-to-close. We
            render our own close control wired to closeComposer. */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <ModalTitle>{t("composer.title")}</ModalTitle>
            <button
              type="button"
              onClick={closeComposer}
              aria-label={t("composer.close")}
              className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <FeedComposer
            signedIn={signedIn}
            viewerDid={viewerDid}
            onPost={handlePost}
            embedded
            autoFocus
            draftText={draft}
            onDraftChange={setDraft}
            draftMentions={draftMentions}
            onDraftMentionsChange={setDraftMentions}
            onAddPhoto={signedIn && viewerDid ? addObservations.open : undefined}
          />
        </div>
      </ModalPortal>
      {/* Rendered at this stable level so it survives the composer modal being
          replaced when the sighting uploader opens. */}
      {addObservations.modal}
    </div>
  );
}

/** Image button in the composer that opens the quick add-a-sighting flow. */
function ComposerObservationButton({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.feed");
  const { open, modal } = useAddObservations(sessionDid);
  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={t("composer.addObservation")}
        title={t("composer.addObservation")}
        className="-ml-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
      >
        <ImageIcon className="size-5" />
      </button>
      {modal}
    </>
  );
}

// ── Like button with a "who liked this" hover card ───────────────────────────

/** Heart toggle + count, shared by feed rows and comment replies. Hovering (or
 *  focusing) the button lazily loads the accounts that liked the subject and
 *  shows them in a tooltip. */
export function LikeButton({
  subjectUri,
  signedIn,
  interactions,
  size = "default",
}: {
  subjectUri: string;
  signedIn: boolean;
  interactions: FeedInteractions;
  size?: "default" | "sm";
}) {
  const t = useTranslations("common.feed");
  const engagement = interactions.getEngagement(subjectUri);
  const liked = Boolean(engagement.viewerLikeUri);
  const [busy, setBusy] = useState(false);
  const hasLikes = engagement.likeCount > 0;

  async function onLike() {
    if (!signedIn) {
      redirectToLogin();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await interactions.toggleLike(subjectUri);
    } catch {
      // The optimistic state already reverted; nothing more to surface here.
    } finally {
      setBusy(false);
    }
  }

  const prefetch = () => {
    if (hasLikes) interactions.loadLikers(subjectUri);
  };

  const button = (
    <button
      type="button"
      onClick={() => void onLike()}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      aria-pressed={liked}
      aria-label={liked ? t("actions.liked") : t("actions.like")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors hover:bg-muted",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        liked ? "text-rose-500" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <HeartIcon className={cn(size === "sm" ? "size-3.5" : "size-4", liked && "fill-current")} />
      <span className="tabular-nums">{hasLikes ? engagement.likeCount : t("actions.like")}</span>
    </button>
  );

  if (!hasLikes) return button;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip onOpenChange={(open) => open && interactions.loadLikers(subjectUri)}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-56">
          <LikersTooltipBody
            state={interactions.getLikers(subjectUri)}
            viewerDid={interactions.viewerDid}
            viewerLiked={liked}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LikersTooltipBody({
  state,
  viewerDid,
  viewerLiked,
}: {
  state: LikersState;
  viewerDid: string | null;
  viewerLiked: boolean;
}) {
  const t = useTranslations("common.feed");

  // Ensure the viewer sees their own like immediately, even while the indexer
  // is still catching up to it.
  const likers = [...state.likers];
  if (viewerLiked && viewerDid && !likers.some((l) => l.did === viewerDid)) {
    likers.unshift({ did: viewerDid, name: null, avatarRef: null });
  }

  if (likers.length === 0) {
    return <span>{state.status === "loading" ? t("actions.loadingLikes") : t("actions.noLikesYet")}</span>;
  }

  const MAX = 8;
  const names = likers.map((l) => (viewerDid && l.did === viewerDid ? t("actions.you") : l.name || t("anonymous")));
  const shown = names.slice(0, MAX);
  const extra = names.length - shown.length;

  return (
    <div className="text-left">
      <p className="mb-1 font-medium">{t("actions.likedBy")}</p>
      <ul className="space-y-0.5">
        {shown.map((name, i) => (
          <li key={i} className="truncate">{name}</li>
        ))}
      </ul>
      {extra > 0 ? <p className="mt-1 opacity-80">{t("actions.moreLikers", { count: extra })}</p> : null}
    </div>
  );
}

// ── Per-row action bar (like + comment) ──────────────────────────────────────

export function FeedActionBar({
  subjectUri,
  signedIn,
  interactions,
  extraActions = null,
}: {
  subjectUri: string;
  signedIn: boolean;
  interactions: FeedInteractions;
  /** Extra controls appended to the like/comment row (e.g. steward actions). */
  extraActions?: ReactNode;
}) {
  const t = useTranslations("common.feed");
  const engagement = interactions.getEngagement(subjectUri);
  const [open, setOpen] = useState(false);

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
        <LikeButton subjectUri={subjectUri} signedIn={signedIn} interactions={interactions} />
        <button
          type="button"
          onClick={onCommentClick}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageCircleIcon className="size-4" />
          <span className="tabular-nums">
            {engagement.commentCount > 0 ? engagement.commentCount : t("actions.comment")}
          </span>
        </button>
        {extraActions}
      </div>

      {open ? <CommentPanel subjectUri={subjectUri} signedIn={signedIn} interactions={interactions} /> : null}
    </div>
  );
}

function CommentPanel({
  subjectUri,
  signedIn,
  interactions,
}: {
  subjectUri: string;
  signedIn: boolean;
  interactions: FeedInteractions;
}) {
  const t = useTranslations("common.feed");
  const { sessionDid, viewerDid, getComments, loadComments, addComment, loadEngagement } = interactions;
  const comments = getComments(subjectUri);
  const viewer = useViewerCard(sessionDid);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<MentionCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(comments === undefined);
  // Which of the viewer's own comments is currently being edited in place.
  const [editingUri, setEditingUri] = useState<string | null>(null);

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

  // Pull like counts for the replies so each one can show + toggle its heart.
  const commentUris = (comments ?? []).map((c) => c.uri).join("\u0000");
  useEffect(() => {
    const uris = commentUris ? commentUris.split("\u0000") : [];
    if (uris.length > 0) loadEngagement(uris);
  }, [commentUris, loadEngagement]);

  const canSend = text.trim().length > 0 && text.length <= COMMENT_MAX && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await addComment(subjectUri, text.trim(), undefined, mentions);
      setText("");
      setMentions([]);
    } catch {
      setError(t("actions.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const list = comments ?? [];
  // Nest the flat thread so replies sit under the comment they answer.
  const tree = useMemo(() => buildCommentTree(list, subjectUri), [list, subjectUri]);

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/30 p-2.5">
      {loading && list.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground/70">{t("actions.loadingComments")}</p>
      ) : tree.length > 0 ? (
        <ul className="mb-2 space-y-2.5">
          {tree.map((node) => (
            <LightboxCommentNode
              key={node.comment.uri}
              node={node}
              subjectUri={subjectUri}
              signedIn={signedIn}
              interactions={interactions}
              viewer={viewer}
              editingUri={editingUri}
              setEditingUri={setEditingUri}
            />
          ))}
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
        <MentionTextarea
          value={text}
          onValueChange={setText}
          onPickMention={(c) => setMentions((prev) => [...prev, c])}
          rows={1}
          maxLength={COMMENT_MAX + 40}
          placeholder={t("actions.commentPlaceholder")}
          ariaLabel={t("actions.commentPlaceholder")}
          className="min-h-9 resize-none rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
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

/** One comment in the lightbox thread: identity, text, an inline editor for the
 *  viewer's own, like + reply actions, the reply composer, and — recursively —
 *  its nested replies. A reply writes against this comment's URI as parent and
 *  the subject as root, so it lands back in the same thread one level deeper. */
function LightboxCommentNode({
  node,
  subjectUri,
  signedIn,
  interactions,
  viewer,
  editingUri,
  setEditingUri,
}: {
  node: CommentTreeNode;
  subjectUri: string;
  signedIn: boolean;
  interactions: FeedInteractions;
  viewer: { name: string | null; avatarUrl: string | null };
  editingUri: string | null;
  setEditingUri: (uri: string | null) => void;
}) {
  const t = useTranslations("common.feed");
  const [replying, setReplying] = useState(false);
  const c = node.comment;
  const isYou = Boolean(interactions.viewerDid && c.did === interactions.viewerDid);
  const name = isYou ? t("actions.you") : c.authorName || t("anonymous");
  const editing = editingUri === c.uri;

  return (
    <li className="flex gap-2">
      <ResolvedAvatar
        did={c.did}
        avatarRef={isYou ? null : c.authorAvatarRef}
        imageUrl={isYou ? viewer.avatarUrl : null}
        name={isYou ? viewer.name ?? name : name}
        fallbackIcon={<UserIcon className="size-3.5" />}
        className="mt-0.5 size-7"
        sizes="28px"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <span className="font-medium text-foreground">{name}</span>{" "}
          <span className="text-xs text-muted-foreground/70">
            {c.createdAt ? formatRelative(c.createdAt) : t("actions.postedJustNow")}
          </span>
          {editing ? (
            <InlineEditor
              initial={c.text}
              initialMentions={c.mentions}
              max={COMMENT_MAX}
              onSave={(value, mentions) => interactions.editComment(subjectUri, c.uri, value, mentions)}
              onCancel={() => setEditingUri(null)}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-foreground/90">
              <MentionText text={c.text} mentions={c.mentions} />
            </p>
          )}
        </div>
        {!editing ? (
          <div className="-ml-2 mt-0.5 flex items-center gap-1">
            <LikeButton subjectUri={c.uri} signedIn={signedIn} interactions={interactions} size="sm" />
            <ReplyToggle signedIn={signedIn} onOpen={() => setReplying(true)} />
            {isYou ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditingUri(c.uri)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <PencilIcon className="size-3" />
                  {t("actions.edit")}
                </button>
                <DeleteButton onDelete={() => interactions.deleteComment(subjectUri, c.uri)} />
              </>
            ) : null}
          </div>
        ) : null}
        {replying ? (
          <ReplyComposer
            viewerDid={interactions.viewerDid}
            onSubmit={(text, mentions) => interactions.addComment(c.uri, text, subjectUri, mentions)}
            onCancel={() => setReplying(false)}
          />
        ) : null}
        {node.replies.length > 0 ? (
          <ul className="mt-2.5 space-y-2.5 border-l border-border/40 pl-2.5">
            {node.replies.map((child) => (
              <LightboxCommentNode
                key={child.comment.uri}
                node={child}
                subjectUri={subjectUri}
                signedIn={signedIn}
                interactions={interactions}
                viewer={viewer}
                editingUri={editingUri}
                setEditingUri={setEditingUri}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
