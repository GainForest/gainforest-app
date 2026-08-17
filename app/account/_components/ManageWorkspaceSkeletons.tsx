import { Skeleton } from "@/components/ui/skeleton";
import Container from "@/components/ui/container";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders for the standalone manage workspaces
 * (/account/<id>/observations/manage and /account/<id>/audio/manage).
 *
 * These pages escape the profile chrome, so they must not inherit the
 * profile's Overview-shaped skeleton — it mirrors folder tiles and a share
 * card that never appear here, and it renders unpadded once the chrome passes
 * children through bare. Each skeleton below mirrors its page's real layout:
 * title, description, the Photos/Audio pills, then the workspace body.
 */

/** The h1 + one-line description both manage workspaces open with. The real
 *  pages set the description mt-1 below the title. */
function WorkspaceTitleSkeleton() {
  return (
    <div>
      {/* h1 (text-2xl sm:text-3xl) + one-line description */}
      <Skeleton className="h-8 w-64 sm:h-9" />
      <Skeleton className="mt-1 h-4 w-80 max-w-full rounded-full" />
    </div>
  );
}

/** The Photos | Audio pill pair the Observations sub-nav shows. */
function MediaTabsSkeleton() {
  return (
    <div className="flex items-center gap-1.5">
      <Skeleton className="h-8 w-24 rounded-full" />
      <Skeleton className="h-8 w-20 rounded-full" />
    </div>
  );
}

/** Observations header: title, description, then the sub-nav pills mt-4 below —
 *  where ObservationsSubNav renders them on that page. */
function WorkspaceHeaderSkeleton() {
  return (
    <div>
      <WorkspaceTitleSkeleton />
      <div className="mt-4">
        <MediaTabsSkeleton />
      </div>
    </div>
  );
}

/**
 * The observations workspace body: search/sort/view toolbar, the group pills,
 * then the square sighting tiles (the first of which is "Add observations").
 * Also used as the Suspense fallback while the first page of sightings loads,
 * so the swap to real content happens in place.
 */
export function ObservationsWorkspaceContentSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Search + sort + view toggles */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Skeleton className="h-11 w-full rounded-full lg:flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-36 rounded-full" />
          <Skeleton className="h-10 w-44 rounded-full" />
          <Skeleton className="h-10 w-20 rounded-full" />
        </div>
      </div>
      {/* Group pills (All observations, projects, datasets…) */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>
      {/* Square sighting tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function ObservationsManageLoadingSkeleton() {
  return (
    <Container className="pt-6 pb-8" aria-busy="true" aria-live="polite">
      <WorkspaceHeaderSkeleton />
      <ObservationsWorkspaceContentSkeleton />
    </Container>
  );
}

/**
 * The audio manage page's loading placeholder. Unlike the observations
 * workspace it does not open with one Container: the AudioMoth workspace stacks
 * the title, the Photos | Audio sub-nav and the workflow body as three
 * max-w-6xl px-6 sections, so this mirrors that to settle in place —
 *
 *   title + description            (pt-6)
 *   Photos | Audio sub-nav         (mt-6 below the title)
 *   recording workflow tab bar     (mt-5, full width on its own row)
 *   Deployments overview card      (mt-6, then gap-6)
 *   the four rows AccountAudioViewer pulses while its listing loads
 *
 * The overview card is a real bordered card at the height it settles to, and
 * the row block copies AccountAudioViewer's in-flight state (four h-16 rounded
 * rows), so the page never changes shape as the real content arrives.
 */
export function AudioManageLoadingSkeleton() {
  return (
    <div className="pb-16" aria-busy="true" aria-live="polite">
      {/* Title + description */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <WorkspaceTitleSkeleton />
      </div>
      {/* Photos | Audio — its own container, 24px below the title. */}
      <div className="mx-auto mt-6 max-w-6xl px-6">
        <MediaTabsSkeleton />
      </div>
      {/* Recording workflow tabs + the library body. */}
      <div className="mx-auto max-w-6xl px-6">
        {/* The six-tab workflow bar (Recordings … Devices). */}
        <div className="mt-5 flex w-full max-w-full gap-1 overflow-hidden rounded-full border border-border bg-card/70 p-1 lg:w-auto">
          {["w-28", "w-24", "w-20", "w-32", "w-28", "w-24"].map((width, index) => (
            <Skeleton key={index} className={cn("h-9 shrink-0 rounded-full", width)} />
          ))}
        </div>
        {/* Deployments overview card, then the rows the viewer pulses while it
            loads. gap-6 matches the real body's major-section rhythm. */}
        <div className="mt-6 flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1">
                {/* section title, then the two-line intro */}
                <Skeleton className="h-6 w-40" />
                <Skeleton className="mt-3 h-4 w-full max-w-prose rounded-full" />
                <Skeleton className="mt-2.5 h-4 w-2/3 max-w-prose rounded-full" />
              </div>
              {/* Upload SD card + Create deployment */}
              <div className="flex shrink-0 items-center gap-2">
                <Skeleton className="h-8 w-32 rounded-full" />
                <Skeleton className="h-8 w-40 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
