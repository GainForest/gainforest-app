"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const TREE_ITEMS_PER_PAGE = 10;

export function getTreePageFromQuery(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function getBoundedPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), totalPages);
}

export function toNullableQueryValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useTreesManageUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setQueryValues = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value.length === 0) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const setQueryValue = useCallback((key: string, value: string | null) => {
    setQueryValues({ [key]: value });
  }, [setQueryValues]);

  return {
    searchQuery: searchParams.get("q") ?? "",
    setSearchQuery: (value: string | null) => setQueryValue("q", value),
    treePageQuery: searchParams.get("tree-page"),
    setTreePageQuery: (value: string | null) => setQueryValue("tree-page", value),
    selectedTreeRkey: searchParams.get("tree") ?? "",
    setSelectedTreeRkey: (value: string | null) => setQueryValue("tree", value),
    datasetFilter: searchParams.get("dataset"),
    setDatasetFilter: (value: string | null) => setQueryValue("dataset", value),
    setQueryValues,
  };
}
