"use client";

import { useRouter } from "next/navigation";
import type { GrantOverview, Recorder } from "./model";
import { MyGrantView } from "./MyGrantView";

/** Route-level wrapper: turns the view's "open my recorders" callback into a
 *  real navigation. The view itself stays presentational. */
export function MyGrantPageClient({
  overview,
  recorders,
  markMilestoneDisabledNote,
}: {
  overview: GrantOverview;
  recorders: Recorder[];
  /** Why milestone check-off is greyed out (nothing persists a claim yet). */
  markMilestoneDisabledNote?: string;
}) {
  const router = useRouter();
  return (
    <MyGrantView
      overview={overview}
      recorders={recorders}
      onOpenRecorders={() => router.push("/grants/my-recorders")}
      markMilestoneDisabledNote={markMilestoneDisabledNote}
    />
  );
}
