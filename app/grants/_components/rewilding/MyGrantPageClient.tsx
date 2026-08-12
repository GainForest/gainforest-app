"use client";

import { useRouter } from "next/navigation";
import type { GrantOverview, Recorder } from "./model";
import { MyGrantView } from "./MyGrantView";

/** Route-level wrapper: turns the view's "open my recorders" callback into a
 *  real navigation. The view itself stays presentational. */
export function MyGrantPageClient({
  overview,
  recorders,
}: {
  overview: GrantOverview;
  recorders: Recorder[];
}) {
  const router = useRouter();
  return (
    <MyGrantView
      overview={overview}
      recorders={recorders}
      onOpenRecorders={() => router.push("/grants/my-recorders")}
    />
  );
}
