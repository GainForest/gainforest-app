import { Skeleton } from "@/components/ui/skeleton";
import Container from "@/components/ui/container";

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

function WorkspaceHeaderSkeleton() {
  return (
    <div>
      {/* h1 (text-2xl sm:text-3xl) + one-line description */}
      <Skeleton className="h-8 w-64 sm:h-9" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full rounded-full" />
      {/* Photos | Audio pills */}
      <div className="mt-4 flex items-center gap-1.5">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
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
 * The audio workspace body: the recording workflow tab bar (library,
 * deployments, upload, label, identifications, soundscape, devices), then the
 * library's own loading rows. The row block copies AccountAudioViewer's
 * in-flight state exactly (four h-16 rounded rows), so the route skeleton, the
 * viewer's own loading state and the settled deployment list line up instead
 * of the page changing shape twice. Widths mirror the workspace sections
 * (max-w-6xl px-6).
 */
export function AudioManageLoadingSkeleton() {
  return (
    <div className="pb-16" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <WorkspaceHeaderSkeleton />
        {/* Workflow tab bar */}
        <div className="mt-5 flex w-full max-w-full gap-1 overflow-hidden rounded-full border border-border bg-card/70 p-1 lg:w-auto lg:self-start">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        {/* Deployments overview card, then the folder rows AccountAudioViewer
            pulses while its listing loads. */}
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-28 rounded-2xl" />
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
