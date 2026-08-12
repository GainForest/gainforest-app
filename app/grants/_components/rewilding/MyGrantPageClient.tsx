"use client";

import { useRouter } from "next/navigation";
import type { GrantDocument, GrantOverview, Recorder } from "./model";
import { MyGrantView } from "./MyGrantView";

/** Route-level wrapper: turns the view's "open my recorders" callback into a
 *  real navigation. The view itself stays presentational. */
export function MyGrantPageClient({
  overview,
  recorders,
  documents,
}: {
  overview: GrantOverview;
  recorders: Recorder[];
  documents: GrantDocument[];
}) {
  const router = useRouter();
  return (
    <MyGrantView
      overview={overview}
      recorders={recorders}
      documents={documents}
      onOpenRecorders={() => router.push("/grants/my-recorders")}
    />
  );
}
