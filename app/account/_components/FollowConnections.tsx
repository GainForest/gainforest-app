"use client";

/**
 * The Followers / Following lists for an account. A segmented toggle switches
 * between the two (each is its own route, so the URL reflects the view), and the
 * active list pages through the indexer. Every row is an account chip (hover
 * card + opens the account drawer) with its own Follow button.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/app/_lib/format";
import { fetchFollowConnections, fetchFollowStats, type FollowConnection } from "@/app/_lib/follows";
import { AuthorChip } from "@/app/_components/AuthorChip";
import { FollowButton } from "@/app/_components/FollowButton";
import { AutoLoadMoreButton } from "@/app/_components/AutoLoadMoreButton";
import { accountFollowersPath, accountFollowingPath } from "../_lib/account-route";

type Direction = "followers" | "following";

const PAGE = 24;

export function FollowConnections({
  did,
  identifier,
  active,
}: {
  did: string;
  identifier: string;
  active: Direction;
}) {
  const t = useTranslations("common.follow");
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchFollowStats(did, null, controller.signal)
      .then((s) => setCounts({ followers: s.followers, following: s.following }))
      .catch(() => {});
    return () => controller.abort();
  }, [did]);

  return (
    <section className="py-6">
      <div className="mb-5 inline-flex rounded-full border border-border bg-card p-1">
        <ToggleLink
          href={accountFollowersPath(identifier)}
          active={active === "followers"}
          label={t("followersTab")}
          count={counts?.followers}
        />
        <ToggleLink
          href={accountFollowingPath(identifier)}
          active={active === "following"}
          label={t("followingTab")}
          count={counts?.following}
        />
      </div>

      <FollowList key={active} did={did} direction={active} />
    </section>
  );
}

function ToggleLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>
          {formatCompact(count)}
        </span>
      ) : null}
    </Link>
  );
}

function FollowList({ did, direction }: { did: string; direction: Direction }) {
  const t = useTranslations("common.follow");
  const [items, setItems] = useState<FollowConnection[]>([]);
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
      const { items: page, nextCursor } = await fetchFollowConnections(did, direction, {
        cursor: cursorRef.current,
        limit: PAGE,
      });
      cursorRef.current = nextCursor;
      setItems((prev) => {
        const merged = prev.slice();
        for (const item of page) {
          if (seenRef.current.has(item.did)) continue;
          seenRef.current.add(item.did);
          merged.push(item);
        }
        return merged;
      });
      setHasMore(Boolean(nextCursor));
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoaded(true);
    }
  }, [did, direction, hasMore, loaded]);

  // Initial page on mount (the component is keyed by direction, so a fresh
  // mount handles switching tabs).
  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loaded && items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {direction === "followers" ? t("emptyFollowers") : t("emptyFollowing")}
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((item) => (
          <li key={item.did} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <AuthorChip did={item.did} />
            </div>
            <FollowButton targetDid={item.did} />
          </li>
        ))}
        {!loaded
          ? Array.from({ length: 6 }).map((_, index) => (
              <li key={`skeleton-${index}`} className="flex items-center gap-3 py-3">
                <span className="skeleton size-7 rounded-full" />
                <span className="skeleton h-4 w-40 rounded" />
              </li>
            ))
          : null}
      </ul>
      {loaded ? (
        <AutoLoadMoreButton
          hasMore={hasMore}
          loading={loading}
          onLoadMore={() => void loadMore()}
          endLabel=""
          className="mx-auto mt-4 block rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        />
      ) : null}
    </div>
  );
}
