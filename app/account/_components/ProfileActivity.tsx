"use client";

/**
 * The Posts / Replies / Likes views for an account, over the GainForest feed
 * lexicons. A segmented toggle switches between the three (each its own route),
 * and the active list pages from the indexer (cursor + auto-load).
 *
 *   - Posts   : the account's top-level feed posts, with like + comment counts
 *   - Replies : the account's replies, linking to what they replied to
 *   - Likes   : the records the account liked, linking to each
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeartIcon, MessageCircleIcon, ReplyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/app/_lib/format";
import {
  classifyRecordUri,
  fetchProfileLikes,
  fetchProfilePosts,
  type ProfileLike,
  type ProfilePost,
  type RecordKind,
} from "@/app/_lib/profile-activity";
import { emptyEngagement, fetchEngagement, type Engagement } from "@/app/_lib/feed-engagement";
import { AuthorChip } from "@/app/_components/AuthorChip";
import { AutoLoadMoreButton } from "@/app/_components/AutoLoadMoreButton";
import { accountLikesPath, accountPostsPath, accountRepliesPath } from "../_lib/account-route";

type Tab = "posts" | "replies" | "likes";

const PAGE = 24;

export function ProfileActivity({
  did,
  identifier,
  active,
}: {
  did: string;
  identifier: string;
  active: Tab;
}) {
  const t = useTranslations("common.activity");
  return (
    <section className="py-6">
      <div className="mb-5 inline-flex rounded-full border border-border bg-card p-1">
        <ToggleLink href={accountPostsPath(identifier)} active={active === "posts"} label={t("postsTab")} />
        <ToggleLink href={accountRepliesPath(identifier)} active={active === "replies"} label={t("repliesTab")} />
        <ToggleLink href={accountLikesPath(identifier)} active={active === "likes"} label={t("likesTab")} />
      </div>

      {active === "likes" ? (
        <LikesList key="likes" did={did} />
      ) : (
        <PostsList key={active} did={did} replies={active === "replies"} />
      )}
    </section>
  );
}

function ToggleLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

/** Shared paginator state machine (mount-keyed by tab so switching resets). */
function usePaged<T>(
  load: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
  keyOf: (item: T) => string,
  onPage?: (items: T[]) => void,
) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || (loaded && !hasMore)) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const { items: page, nextCursor } = await load(cursorRef.current);
      cursorRef.current = nextCursor;
      const fresh: T[] = [];
      setItems((prev) => {
        const merged = prev.slice();
        for (const item of page) {
          const key = keyOf(item);
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);
          merged.push(item);
          fresh.push(item);
        }
        return merged;
      });
      if (fresh.length) onPage?.(fresh);
      setHasMore(Boolean(nextCursor));
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loaded]);

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, hasMore, loading, loaded, loadMore };
}

function PostsList({ did, replies }: { did: string; replies: boolean }) {
  const t = useTranslations("common.activity");
  const [engagement, setEngagement] = useState<Map<string, Engagement>>(() => new Map());

  const loadEngagement = useCallback((posts: ProfilePost[]) => {
    const uris = posts.map((p) => p.uri);
    if (uris.length === 0) return;
    void fetchEngagement(uris, null)
      .then((map) => {
        setEngagement((prev) => {
          const next = new Map(prev);
          for (const [uri, value] of map) next.set(uri, value);
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const { items, hasMore, loading, loaded, loadMore } = usePaged<ProfilePost>(
    (cursor) => fetchProfilePosts(did, replies, { cursor, limit: PAGE }),
    (p) => p.uri,
    loadEngagement,
  );

  if (loaded && items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {replies ? t("emptyReplies") : t("emptyPosts")}
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((post) => {
          const stats = engagement.get(post.uri) ?? emptyEngagement();
          const parent = post.parentUri ? classifyRecordUri(post.parentUri) : null;
          return (
            <li key={post.uri} className="py-3.5">
              {replies && parent ? (
                <Link
                  href={parent.href}
                  className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <ReplyIcon className="size-3" />
                  {t("replyingTo", { kind: t(`kind.${parent.kind}` as const) })}
                </Link>
              ) : null}
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">{post.text}</p>
              <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                {post.createdAt ? <span>{formatRelative(post.createdAt)}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <HeartIcon className="size-3.5" />
                  <span className="tabular-nums">{stats.likeCount}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircleIcon className="size-3.5" />
                  <span className="tabular-nums">{stats.commentCount}</span>
                </span>
              </div>
            </li>
          );
        })}
        {!loaded ? <ActivitySkeleton /> : null}
      </ul>
      {loaded ? (
        <AutoLoadMoreButton hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} className="mt-4" />
      ) : null}
    </div>
  );
}

function LikesList({ did }: { did: string }) {
  const t = useTranslations("common.activity");
  const { items, hasMore, loading, loaded, loadMore } = usePaged<ProfileLike>(
    (cursor) => fetchProfileLikes(did, { cursor, limit: PAGE }),
    (like) => like.uri,
  );

  if (loaded && items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyLikes")}</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((like) => {
          const info = classifyRecordUri(like.subjectUri);
          const kindLabel = info ? t(`kind.${info.kind}` as const) : null;
          return (
            <li key={like.uri} className="py-3.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HeartIcon className="size-3.5 fill-current text-rose-500" />
                <span>{t("liked")}</span>
                {info && kindLabel ? (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={info.href} className="hover:text-foreground hover:underline">
                      {kindLabel}
                    </Link>
                  </>
                ) : null}
                {like.createdAt ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatRelative(like.createdAt)}</span>
                  </>
                ) : null}
              </div>
              {info ? (
                <div className="mt-1.5">
                  <AuthorChip did={info.did} />
                </div>
              ) : null}
            </li>
          );
        })}
        {!loaded ? <ActivitySkeleton /> : null}
      </ul>
      {loaded ? (
        <AutoLoadMoreButton hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} className="mt-4" />
      ) : null}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={`skeleton-${index}`} className="space-y-2 py-3.5">
          <span className="skeleton block h-4 w-3/4 rounded" />
          <span className="skeleton block h-3 w-1/3 rounded" />
        </li>
      ))}
    </>
  );
}
