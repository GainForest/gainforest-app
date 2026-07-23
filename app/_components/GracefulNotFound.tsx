import Link from "next/link";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisplayHeading } from "@/components/ui/typography";

type GracefulNotFoundProps = {
  title: string;
  message: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

export function GracefulNotFound({
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
        <DisplayHeading as="h1" className="text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
          {title}
        </DisplayHeading>

        <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground sm:text-lg">
          {message}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" size="lg">
            <Link href={secondaryHref}>
              <ArrowLeftIcon aria-hidden="true" />
              {secondaryLabel}
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href={primaryHref}>
              <SearchIcon aria-hidden="true" />
              {primaryLabel}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
