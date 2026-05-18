import Image from "next/image";

// Four-step "How it works" strip with thin arrows between steps, port of the
// mid-section in /Users/david/Downloads/02101890-2e05-463d-8151-44123926d31b.png.
const STEPS: ReadonlyArray<{
  icon: string;
  title: string;
  body: string;
}> = [
  {
    icon: "/decor/icon-step-discover.png",
    title: "Discover",
    body: "Explore projects and communities worldwide using our visual map.",
  },
  {
    icon: "/decor/icon-step-understand.png",
    title: "Understand",
    body: "Learn about the impact, methods, and people behind each project.",
  },
  {
    icon: "/decor/icon-step-support.png",
    title: "Support",
    body: "Contribute funding, resources, or skills to drive impact.",
  },
  {
    icon: "/decor/icon-step-grow.png",
    title: "Grow impact",
    body: "Track outcomes, earn Bumicerts, and help nature thrive.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-16 pt-14 pb-14">
        <h2 className="font-garamond text-[44px] font-normal leading-[1.05] text-foreground">
          How it works
        </h2>

        <ol className="mt-10 grid grid-cols-1 gap-y-12 sm:grid-cols-2 lg:flex lg:items-start lg:gap-0">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-1 items-start gap-5 lg:gap-4"
            >
              {/* numbered chip + icon column */}
              <div className="flex flex-col items-center">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background/60 font-garamond text-[13px] text-foreground/65">
                  {i + 1}
                </span>
                <div className="relative mt-3 h-[88px] w-[88px]">
                  <Image
                    src={step.icon}
                    alt=""
                    fill
                    sizes="88px"
                    className="object-contain"
                  />
                </div>
              </div>

              {/* title + body */}
              <div className="pt-7 lg:pt-7">
                <h3 className="font-garamond text-[22px] font-medium leading-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[210px] text-[13.5px] leading-relaxed text-foreground/65">
                  {step.body}
                </p>
              </div>

              {/* connector arrow \u2014 hidden after the last item and on mobile */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden self-center pl-2 pr-4 text-[22px] text-foreground/30 lg:inline"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
