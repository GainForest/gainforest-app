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
  eyebrow,
  title,
  effectiveDate,
  intro,
  sections,
  backLabel,
  relatedLinks,
}: {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  intro: ReactNode[];
  sections: LegalSection[];
  backLabel: string;
  relatedLinks: LegalLink[];
}) {
  return (
    <main className="px-4 py-10 sm:px-6 md:py-16">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/bioblitz"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← {backLabel}
        </Link>

        <div className="mt-5 rounded-[2rem] border border-border bg-card/70 p-6 shadow-sm md:p-10">
          <header className="border-b border-border pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
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
                <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
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
      </article>
    </main>
  );
}
