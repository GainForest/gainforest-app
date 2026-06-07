import Link from "next/link";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";

type GracefulNotFoundProps = {
  eyebrow: string;
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

export function GracefulNotFound({
  eyebrow,
  title,
  message,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: GracefulNotFoundProps) {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-16">
      <section className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <p className="mb-4 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
          {eyebrow}
        </p>

        <h1 className="font-instrument text-4xl italic leading-tight tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>

        <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground sm:text-lg">
          {message}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={secondaryHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            {secondaryLabel}
          </Link>
          <Link
            href={primaryHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <SearchIcon className="h-4 w-4" aria-hidden="true" />
            {primaryLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
