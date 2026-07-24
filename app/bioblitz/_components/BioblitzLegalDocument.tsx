import Link from "next/link";
import type { ReactNode } from "react";

type LegalSection = {
  title: string;
  paragraphs: ReactNode[];
};

type LegalLink = {
  href: string;
  label: string;
};

export function BioblitzLegalDocument({
  title,
  effectiveDate,
  intro,
  sections,
  backLabel,
  relatedLinks,
}: {
  title: string;
  effectiveDate: string;
  intro: ReactNode[];
  sections: LegalSection[];
  backLabel: string;
  relatedLinks: LegalLink[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-3 py-4 sm:px-5 lg:px-8 lg:py-6">
        <Link
          href="/bioblitz"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← {backLabel}
        </Link>

        <div className="mt-8 rounded-3xl bg-muted p-4 sm:p-5 md:p-8">
          <header className="border-b border-border pb-8">
            <h1 className="font-instrument text-4xl font-light italic tracking-tight text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">{effectiveDate}</p>
          </header>

          <div className="mt-8 space-y-5 text-[15px] leading-7 text-muted-foreground">
            {intro.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-10 space-y-10">
            {sections.map((section) => (
              <section key={section.title} className="scroll-mt-24">
                <h2 className="font-instrument text-2xl font-light italic tracking-tight text-foreground">
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground">
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm">
            {relatedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
    </main>
  );
}
