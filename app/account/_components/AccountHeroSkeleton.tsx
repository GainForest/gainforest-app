import { Skeleton } from "@/components/ui/skeleton";
import { ACCOUNT_OVERVIEW_FOLDER_IDS, OVERVIEW_FOLDER_ART } from "./OverviewFolderArt";

/**
 * Loading placeholder that mirrors the card-style account hero shared by
 * {@link AccountHero} and {@link EditableHero}: a cover band with its corner
 * controls, an overlapping round avatar, the identity column (name, bio,
 * follower counts, quiet facts) and the row of action pills.
 *
 * Two rules run through every placeholder in this file:
 *
 * 1. Only paint what has a fixed size — the cover, the avatar, buttons. Copy
 *    that comes from the account (its name, bio, counts) is left unpainted, so
 *    no grey bar ever morphs into text of a different length.
 * 2. Reserve that copy's space anyway. The heights below track the real hero's
 *    type scale, and the identity column is what drives the hero's height (it
 *    is taller than the 96px avatar), so every line has to be accounted for or
 *    the page jumps when the hero paints.
 */
export function AccountHeroSkeleton() {
  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* Cover band */}
      <div className="relative h-32 sm:h-40 md:h-44">
        <Skeleton className="absolute inset-0 rounded-none" />
        {/* Share pill, with the "Account details" toggle tucked under it. */}
        <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
          <Skeleton className="h-8 w-10 rounded-full sm:w-20" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
      </div>

      {/* Identity */}
      <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end md:gap-5">
          <Skeleton className="size-24 shrink-0 rounded-full ring-4 ring-card" />
          <div className="min-w-0 max-w-2xl md:flex-1 md:pb-1">
            {/* Display name — text-3xl/text-4xl at leading-[1.1]. */}
            <div className="h-[33px] md:h-10" />
            {/* Short bio — one line of text-sm/leading-relaxed. */}
            <div className="mt-1.5 h-[23px]" />
            {/* Follower / following counts. */}
            <div className="mt-2.5 h-5" />
            {/* Quiet facts row — joined date, country, organization type. */}
            <div className="mt-2.5 h-5" />
          </div>
        </div>

        {/* Action pills — follow, direct support, outbound links. */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-[104px] rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
    </section>
  );
}

/**
 * Loading placeholder for {@link AccountTabBar}: the three universal
 * destinations (Overview, Projects, Observations) plus the "More" menu that
 * holds everything else — icon, label, and its chevron.
 */
export function AccountTabsSkeleton() {
  return (
    <div className="mt-3">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hidden">
        <div className="flex min-w-max items-end gap-1 border-b border-border">
          {["w-14", "w-14", "w-[86px]"].map((width, index) => (
            <div key={index} className="flex items-center gap-1.5 px-3 py-2.5">
              <Skeleton className="size-3.5 rounded-sm" />
              <Skeleton className={`h-5 ${width}`} />
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-2.5">
            <Skeleton className="size-3.5 rounded-sm" />
            <Skeleton className="h-5 w-9" />
            <Skeleton className="size-3.5 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A single folder-tile skeleton mirroring {@link FolderTile}. It repeats the
 * tile's geometry as plain DOM — the real tile animates in with Framer Motion,
 * which would leave a streamed placeholder invisible until hydration — and
 * paints the same peeking art, which is static decoration rather than data.
 */
function OverviewFolderSkeleton({ id }: { id: string }) {
  const art = OVERVIEW_FOLDER_ART[id];

  return (
    <div className="relative">
      {art ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-end pr-3.5">
          <div className="rotate-6">{art}</div>
        </div>
      ) : null}

      <div className="relative pt-7">
        {/* tab */}
        <div className="absolute left-0 top-[12px] z-20 h-[19px] w-[42%] rounded-t-lg border border-b-0 border-border/60 bg-card" />
        {/* body — the figure is a live count and the title a short label, so
            both are left unpainted; the card's min height holds the tile. */}
        <div className="relative z-10 flex min-h-[86px] flex-col justify-end rounded-[18px] rounded-tl-none border border-border/60 bg-card p-3.5">
          <div className="h-6" />
          <div className="mt-1 h-[19px]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Loading placeholder for the {@link OverviewFolders} tile grid. Pass the ids
 * of the tiles the surface actually renders, in order, so the placeholder shows
 * the same number of folders with the same art.
 */
export function OverviewFoldersSkeleton({
  ids = ACCOUNT_OVERVIEW_FOLDER_IDS,
}: {
  ids?: readonly string[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {ids.map((id) => (
        <OverviewFolderSkeleton key={id} id={id} />
      ))}
    </div>
  );
}

/**
 * Loading placeholder for the default account overview tab: the folder-tile
 * grid followed by the share-profile card. Shared by the account section's
 * full-shell loading and the per-tab page loading so the two transitions line
 * up without a jump. (The optional About blurb above the grid is left out — it
 * only renders for profiles carrying a detail record.)
 */
export function AccountOverviewContentSkeleton() {
  return (
    <div className="space-y-5 py-2">
      <OverviewFoldersSkeleton />
      <section className="rounded-2xl border border-border bg-card/80 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Skeleton className="h-5 w-36 max-w-full" />
          <Skeleton className="mt-0.5 h-[23px] w-72 max-w-full" />
        </div>
        <div className="mt-3 shrink-0 sm:mt-0">
          <Skeleton className="h-8 w-[132px] rounded-full" />
        </div>
      </section>
    </div>
  );
}
