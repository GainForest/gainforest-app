"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { RotateCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchFollowConnections, fetchFollowStats, type FollowConnection } from "@/app/_lib/follows";
import { AuthorChip } from "@/app/_components/AuthorChip";
import { FollowButton } from "@/app/_components/FollowButton";
import { AutoLoadMoreButton } from "@/app/_components/AutoLoadMoreButton";
import { Button } from "@/components/ui/button";
import { accountFollowersPath, accountFollowingPath } from "../_lib/account-route";
import {
  ProfileRowsSkeleton,
  ProfileSegmentedNavigation,
  profileListIdentity,
  takeFreshProfileItems,
} from "./ProfileListSkeleton";

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
  const format = useFormatter();
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCounts(null);
    fetchFollowStats(did, null, controller.signal)
      .then((stats) => setCounts({ followers: stats.followers, following: stats.following }))
      .catch(() => {});
    return () => controller.abort();
  }, [did]);

  const count = (value: number | undefined, selected: boolean) =>
    typeof value === "number" ? (
      <span className={cn("tabular-nums", selected ? "text-foreground/65" : "text-muted-foreground/70")}>
        {format.number(value, { notation: "compact", maximumFractionDigits: 1 })}
      </span>
    ) : undefined;

  return (
    <section className="py-6">
      <ProfileSegmentedNavigation
        ariaLabel={t("navigationLabel")}
        segments={[
          {
            href: accountFollowersPath(identifier),
            active: active === "followers",
            label: t("followersTab"),
            count: count(counts?.followers, active === "followers"),
          },
          {
            href: accountFollowingPath(identifier),
            active: active === "following",
            label: t("followingTab"),
            count: count(counts?.following, active === "following"),
          },
        ]}
      />

      <FollowList key={profileListIdentity(did, active)} did={did} direction={active} />
    </section>
  );
}

function FollowList({ did, direction }: { did: string; direction: Direction }) {
  const t = useTranslations("common.follow");
  const [items, setItems] = useState<FollowConnection[]>([]);
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
      const { items: page, nextCursor } = await fetchFollowConnections(did, direction, {
        cursor: cursorRef.current,
        limit: PAGE,
      });
      cursorRef.current = nextCursor;
      const fresh = takeFreshProfileItems(page, seenRef.current, (item) => item.did);
      if (fresh.length > 0) setItems((previous) => [...previous, ...fresh]);
      setHasMore(Boolean(nextCursor));
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setLoaded(true);
    }
  }, [did, direction, hasMore, loaded]);

  useEffect(() => {
    void loadMore();
    // The parent key remounts this list when DID or direction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadError = (
    <div role="alert" className="my-6 flex flex-col items-center gap-3 rounded-2xl bg-muted px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">{t("loadError")}</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => void loadMore()}>
        <RotateCwIcon aria-hidden />
        {t("retry")}
      </Button>
    </div>
  );

  if (loaded && error && items.length === 0) return loadError;
  if (loaded && !error && items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{direction === "followers" ? t("emptyFollowers") : t("emptyFollowing")}</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {items.map((item) => (
          <li key={item.did} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><AuthorChip did={item.did} /></div>
            <FollowButton targetDid={item.did} />
          </li>
        ))}
      </ul>
      {!loaded ? <ProfileRowsSkeleton variant="people" /> : null}
      {error && items.length > 0 ? loadError : null}
      {loaded && !error ? (
        <AutoLoadMoreButton
          hasMore={hasMore}
          loading={loading}
          onLoadMore={() => void loadMore()}
          endLabel=""
          className="mx-auto mt-4 block rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        />
      ) : null}
    </div>
  );
}
