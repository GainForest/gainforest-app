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
import { resolveBlobUrl } from "@/app/_lib/pds";
import {
  classifyRecordUri,
  fetchProfileLikes,
  fetchProfilePosts,
  fetchRecordPreviews,
  type ProfileLike,
  type ProfilePost,
  type RecordPreview,
} from "@/app/_lib/profile-activity";
import { emptyEngagement, fetchEngagement, type Engagement } from "@/app/_lib/feed-engagement";
import { AuthorChip } from "@/app/_components/AuthorChip";
import { AutoLoadMoreButton } from "@/app/_components/AutoLoadMoreButton";
import { accountLikesPath, accountPostsPath, accountRepliesPath } from "../_lib/account-route";

type Tab = "posts" | "replies" | "likes";

const PAGE = 24;
const LOAD_MORE_CLASS =
  "mx-auto mt-4 block rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

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

  const [previews, setPreviews] = useState<Map<string, RecordPreview | null>>(() => new Map());

  // For each freshly loaded page, fan out two batched reads instead of one query
  // per card: engagement counts for the posts, and previews for the records the
  // replies target.
  const onPage = useCallback((posts: ProfilePost[]) => {
    const uris = posts.map((p) => p.uri);
    if (uris.length > 0) {
      void fetchEngagement(uris, null)
        .then((map) => {
          setEngagement((prev) => {
            const next = new Map(prev);
            for (const [uri, value] of map) next.set(uri, value);
            return next;
          });
        })
        .catch(() => {});
    }
    const parentUris = posts.map((p) => p.parentUri).filter((uri): uri is string => Boolean(uri));
    if (parentUris.length > 0) {
      void fetchRecordPreviews(parentUris)
        .then((map) => {
          setPreviews((prev) => {
            const next = new Map(prev);
            for (const [uri, value] of map) next.set(uri, value);
            return next;
          });
        })
        .catch(() => {});
    }
  }, []);

  const { items, hasMore, loading, loaded, loadMore } = usePaged<ProfilePost>(
    (cursor) => fetchProfilePosts(did, replies, { cursor, limit: PAGE }),
    (p) => p.uri,
    onPage,
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
          return (
            <li key={post.uri} className="py-3.5">
              {replies && post.parentUri ? (
                <div className="mb-2">
                  <div className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ReplyIcon className="size-3" />
                    {t("inReplyTo")}
                  </div>
                  <RecordPreviewCard uri={post.parentUri} preview={previews.get(post.parentUri)} />
                </div>
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
        <AutoLoadMoreButton hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} className={LOAD_MORE_CLASS} endLabel="" />
      ) : null}
    </div>
  );
}

function LikesList({ did }: { did: string }) {
  const t = useTranslations("common.activity");
  const [previews, setPreviews] = useState<Map<string, RecordPreview | null>>(() => new Map());

  // Batch the previews for a whole page of liked records in one go.
  const onPage = useCallback((likes: ProfileLike[]) => {
    const uris = likes.map((like) => like.subjectUri).filter(Boolean);
    if (uris.length === 0) return;
    void fetchRecordPreviews(uris)
      .then((map) => {
        setPreviews((prev) => {
          const next = new Map(prev);
          for (const [uri, value] of map) next.set(uri, value);
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const { items, hasMore, loading, loaded, loadMore } = usePaged<ProfileLike>(
    (cursor) => fetchProfileLikes(did, { cursor, limit: PAGE }),
    (like) => like.uri,
    onPage,
  );

  if (loaded && items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyLikes")}</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((like) => (
          <li key={like.uri} className="py-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HeartIcon className="size-3.5 fill-current text-rose-500" />
              <span>{t("liked")}</span>
              {like.createdAt ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{formatRelative(like.createdAt)}</span>
                </>
              ) : null}
            </div>
            <RecordPreviewCard uri={like.subjectUri} preview={previews.get(like.subjectUri)} />
          </li>
        ))}
        {!loaded ? <ActivitySkeleton /> : null}
      </ul>
      {loaded ? (
        <AutoLoadMoreButton hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} className={LOAD_MORE_CLASS} endLabel="" />
      ) : null}
    </div>
  );
}

/** Compact preview of the record a reply targets or a like points at: thumbnail
 *  + owner + title/text, linking to it. Falls back to an owner chip + kind link
 *  for kinds we don't resolve (e.g. certs) or records that no longer exist. */
function RecordPreviewCard({ uri, preview: data }: { uri: string; preview: RecordPreview | null | undefined }) {
  const t = useTranslations("common.activity");
  const base = classifyRecordUri(uri);

  if (!base) return null;
  const kindLabel = t(`kind.${base.kind}`);

  if (data === undefined) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3">
        <span className="skeleton block h-3.5 w-1/2 rounded" />
        <span className="skeleton mt-2 block h-3 w-2/3 rounded" />
      </div>
    );
  }

  if (data && (data.title || data.text)) {
    return (
      <Link
        href={data.href}
        className="flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3 transition-colors hover:bg-muted/50"
      >
        <Thumb did={data.did} imageUrl={data.imageUrl} imageRef={data.imageRef} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-muted-foreground">
            {data.ownerName ? `${data.ownerName} · ${kindLabel}` : kindLabel}
          </div>
          {data.title ? <div className="truncate text-sm font-medium text-foreground">{data.title}</div> : null}
          {data.text ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{data.text}</p> : null}
        </div>
      </Link>
    );
  }

  // No resolvable content (e.g. a cert, or a deleted record): owner + link.
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-2.5">
      <div className="min-w-0 flex-1">
        <AuthorChip did={base.did} />
      </div>
      <Link href={base.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
        {kindLabel}
      </Link>
    </div>
  );
}

function Thumb({ did, imageUrl, imageRef }: { did: string; imageUrl: string | null; imageRef: string | null }) {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    setResolved(null);
    if (imageUrl || !imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(did, imageRef, controller.signal)
      .then((url) => setResolved(url))
      .catch(() => {});
    return () => controller.abort();
  }, [did, imageUrl, imageRef]);
  const src = imageUrl ?? resolved;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary PDS/CDN hosts
    <img src={src} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
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
