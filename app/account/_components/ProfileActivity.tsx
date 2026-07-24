"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { HeartIcon, MessageCircleIcon, ReplyIcon, RotateCwIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { accountLikesPath, accountPostsPath, accountRepliesPath } from "../_lib/account-route";
import {
  ProfileRowsSkeleton,
  ProfileSegmentedNavigation,
  profileListIdentity,
  takeFreshProfileItems,
} from "./ProfileListSkeleton";

type Tab = "posts" | "replies" | "likes";

const PAGE = 24;
const LOAD_MORE_CLASS =
  "mx-auto mt-4 block rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none";

const postKey = (post: ProfilePost) => post.uri;
const likeKey = (like: ProfileLike) => like.uri;

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
  const identity = profileListIdentity(did, active);

  return (
    <section className="py-6">
      <ProfileSegmentedNavigation
        ariaLabel={t("navigationLabel")}
        segments={[
          { href: accountPostsPath(identifier), active: active === "posts", label: t("postsTab") },
          { href: accountRepliesPath(identifier), active: active === "replies", label: t("repliesTab") },
          { href: accountLikesPath(identifier), active: active === "likes", label: t("likesTab") },
        ]}
      />

      {active === "likes" ? (
        <LikesList key={identity} did={did} />
      ) : (
        <PostsList key={identity} did={did} replies={active === "replies"} />
      )}
    </section>
  );
}

type PagedState<T> = {
  items: T[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: boolean;
  loadMore: () => Promise<void>;
};

/** Paginator mounted under a DID + view key, preserving loaded rows on later-page errors. */
function usePaged<T>(
  load: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
  keyOf: (item: T) => string,
  onPage?: (items: T[]) => void,
): PagedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || (loaded && !hasMore)) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const { items: page, nextCursor } = await load(cursorRef.current);
      cursorRef.current = nextCursor;
      const fresh = takeFreshProfileItems(page, seenRef.current, keyOf);
      if (fresh.length > 0) {
        setItems((previous) => [...previous, ...fresh]);
        onPage?.(fresh);
      }
      setHasMore(Boolean(nextCursor));
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoaded(true);
    }
  }, [hasMore, keyOf, load, loaded, onPage]);

  useEffect(() => {
    void loadMore();
    // The parent key remounts this state machine when DID or view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, hasMore, loading, loaded, error, loadMore };
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("common.activity");
  return (
    <div role="alert" className="my-6 flex flex-col items-center gap-3 rounded-2xl bg-muted px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">{t("loadError")}</p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCwIcon aria-hidden />
        {t("retry")}
      </Button>
    </div>
  );
}

function PostsList({ did, replies }: { did: string; replies: boolean }) {
  const t = useTranslations("common.activity");
  const format = useFormatter();
  const [engagement, setEngagement] = useState<Map<string, Engagement>>(() => new Map());
  const [previews, setPreviews] = useState<Map<string, RecordPreview | null>>(() => new Map());

  const onPage = useCallback((posts: ProfilePost[]) => {
    const uris = posts.map((post) => post.uri);
    if (uris.length > 0) {
      void fetchEngagement(uris, null)
        .then((map) => {
          setEngagement((previous) => {
            const next = new Map(previous);
            for (const [uri, value] of map) next.set(uri, value);
            return next;
          });
        })
        .catch(() => {});
    }
    const parentUris = posts.map((post) => post.parentUri).filter((uri): uri is string => Boolean(uri));
    if (parentUris.length > 0) {
      void fetchRecordPreviews(parentUris)
        .then((map) => {
          setPreviews((previous) => {
            const next = new Map(previous);
            for (const [uri, value] of map) next.set(uri, value);
            return next;
          });
        })
        .catch(() => {});
    }
  }, []);
  const loadPage = useCallback(
    (cursor: string | null) => fetchProfilePosts(did, replies, { cursor, limit: PAGE }),
    [did, replies],
  );
  const { items, hasMore, loading, loaded, error, loadMore } = usePaged(loadPage, postKey, onPage);

  if (loaded && error && items.length === 0) return <LoadError onRetry={() => void loadMore()} />;
  if (loaded && !error && items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{replies ? t("emptyReplies") : t("emptyPosts")}</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((post) => {
          const stats = engagement.get(post.uri) ?? emptyEngagement();
          return (
            <li key={post.uri} className="py-1">
              <article className="rounded-2xl px-3 py-4 transition-colors hover:bg-muted/40 motion-reduce:transition-none">
                {replies && post.parentUri ? (
                  <div className="mb-3">
                    <p className="mb-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ReplyIcon className="size-3" aria-hidden />
                      {t("inReplyTo")}
                    </p>
                    <RecordPreviewCard uri={post.parentUri} preview={previews.get(post.parentUri)} />
                  </div>
                ) : null}
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">{post.text}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  {post.createdAt ? <ActivityTime iso={post.createdAt} format={format.relativeTime} /> : null}
                  <span className="inline-flex items-center gap-1">
                    <HeartIcon className="size-3.5" aria-hidden />
                    <span className="tabular-nums">{stats.likeCount}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircleIcon className="size-3.5" aria-hidden />
                    <span className="tabular-nums">{stats.commentCount}</span>
                  </span>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {!loaded ? <ProfileRowsSkeleton variant="activity" /> : null}
      {error && items.length > 0 ? <LoadError onRetry={() => void loadMore()} /> : null}
      {loaded && !error ? (
        <AutoLoadMoreButton hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} className={LOAD_MORE_CLASS} endLabel="" />
      ) : null}
    </div>
  );
}

function LikesList({ did }: { did: string }) {
  const t = useTranslations("common.activity");
  const format = useFormatter();
  const [previews, setPreviews] = useState<Map<string, RecordPreview | null>>(() => new Map());
  const onPage = useCallback((likes: ProfileLike[]) => {
    const uris = likes.map((like) => like.subjectUri).filter(Boolean);
    if (uris.length === 0) return;
    void fetchRecordPreviews(uris)
      .then((map) => {
        setPreviews((previous) => {
          const next = new Map(previous);
          for (const [uri, value] of map) next.set(uri, value);
          return next;
        });
      })
      .catch(() => {});
  }, []);
  const loadPage = useCallback(
    (cursor: string | null) => fetchProfileLikes(did, { cursor, limit: PAGE }),
    [did],
  );
  const { items, hasMore, loading, loaded, error, loadMore } = usePaged(loadPage, likeKey, onPage);

  if (loaded && error && items.length === 0) return <LoadError onRetry={() => void loadMore()} />;
  if (loaded && !error && items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyLikes")}</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((like) => (
          <li key={like.uri} className="py-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HeartIcon className="size-3.5 fill-current text-rose-500" aria-hidden />
              <span>{t("liked")}</span>
              {like.createdAt ? <><span aria-hidden>·</span><ActivityTime iso={like.createdAt} format={format.relativeTime} /></> : null}
            </div>
            <RecordPreviewCard uri={like.subjectUri} preview={previews.get(like.subjectUri)} />
          </li>
        ))}
      </ul>
      {!loaded ? <ProfileRowsSkeleton variant="activity" /> : null}
      {error && items.length > 0 ? <LoadError onRetry={() => void loadMore()} /> : null}
      {loaded && !error ? (
        <AutoLoadMoreButton hasMore={hasMore} loading={loading} onLoadMore={() => void loadMore()} className={LOAD_MORE_CLASS} endLabel="" />
      ) : null}
    </div>
  );
}

function ActivityTime({ iso, format }: { iso: string; format: (value: Date) => string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return <span>{format(date)}</span>;
}

function RecordPreviewCard({ uri, preview: data }: { uri: string; preview: RecordPreview | null | undefined }) {
  const t = useTranslations("common.activity");
  const base = classifyRecordUri(uri);
  if (!base) return null;
  const kindLabel = t(`kind.${base.kind}`);

  if (data === undefined) {
    return (
      <div className="rounded-2xl bg-muted p-3">
        <span className="skeleton block h-3.5 w-1/2 rounded" />
        <span className="skeleton mt-2 block h-3 w-2/3 rounded" />
      </div>
    );
  }

  if (data && (data.title || data.text)) {
    return (
      <Link href={data.href} className="flex gap-3 rounded-2xl bg-muted p-3 transition-colors hover:bg-muted/70 motion-reduce:transition-none">
        <Thumb did={data.did} imageUrl={data.imageUrl} imageRef={data.imageRef} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-muted-foreground">{data.ownerName ? `${data.ownerName} · ${kindLabel}` : kindLabel}</div>
          {data.title ? <div className="truncate text-sm font-medium text-foreground">{data.title}</div> : null}
          {data.text ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{data.text}</p> : null}
        </div>
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-3">
      <div className="min-w-0 flex-1"><AuthorChip did={base.did} /></div>
      <Link href={base.href} className="shrink-0 text-xs font-medium text-primary hover:underline">{kindLabel}</Link>
    </div>
  );
}

function Thumb({ did, imageUrl, imageRef }: { did: string; imageUrl: string | null; imageRef: string | null }) {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    setResolved(null);
    if (imageUrl || !imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(did, imageRef, controller.signal).then(setResolved).catch(() => {});
    return () => controller.abort();
  }, [did, imageUrl, imageRef]);
  const src = imageUrl ?? resolved;
  if (!src) return null;
  return <img src={src} alt="" className="size-12 shrink-0 rounded-lg object-cover" />;
}
