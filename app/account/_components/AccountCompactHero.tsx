import Image from "next/image";
import type { AccountRouteData } from "../_lib/account-route";

/**
 * A single compact identity header shared by every account tab. Detailed
 * profile metadata and editing live in the Overview tab instead of expanding
 * this header in place.
 */
export function AccountCompactHero({ account }: { account: AccountRouteData }) {
  const initial = account.displayName.charAt(0).toUpperCase();

  return (
    <section data-account-compact-hero className="rounded-2xl bg-muted/60 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-background ring-1 ring-border/60">
          {account.avatarUrl ? (
            <Image
              src={account.avatarUrl}
              alt=""
              fill
              unoptimized
              sizes="44px"
              className="object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center text-sm font-semibold text-muted-foreground">
              {initial}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-instrument text-xl font-light italic leading-tight text-foreground">
            {account.displayName}
          </h1>
          {account.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {account.description}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
