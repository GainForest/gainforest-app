"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type TreesMode = "upload" | null;

export function useTreesMode(): [TreesMode, (mode: TreesMode) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();

  const mode = searchParams.get("mode") === "upload" ? "upload" : null;

  const setMode = useCallback(
    (value: TreesMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "upload") {
        params.set("mode", "upload");
      } else {
        params.delete("mode");
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return [mode, setMode];
}
