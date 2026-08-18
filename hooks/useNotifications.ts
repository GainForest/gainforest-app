"use client";

import { useQuery } from "@tanstack/react-query";

import type { NotificationItem } from "@/app/_lib/notifications";

export type NotificationsResponse = {
  items: NotificationItem[];
  unreadCount: number;
  seenAt: string | null;
};

/**
 * Poll the viewer's notifications (likes + comments on their records). Disabled
 * when signed out. Refetches on an interval so the bell badge stays fresh while
 * the tab is open; React Query dedupes across the bell badge and the open panel.
 */
export function useNotifications(enabled: boolean) {
  return useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=30", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json() as Promise<NotificationsResponse>;
    },
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 45_000,
  });
}
