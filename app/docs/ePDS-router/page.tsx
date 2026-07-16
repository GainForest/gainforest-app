import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon, FingerprintIcon, PlugZapIcon, SplitIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { CodeSnippet } from "./_components/CodeSnippet";
import { RouterLookupDemo } from "./_components/RouterLookupDemo";
import { SyncJourney } from "./_components/SyncJourney";

const GITHUB_URL = "https://github.com/GainForest/ePDS-router";
const ROUTER_URL = "https://router.gainforest.id";

const ENROLL_SNIPPET = `curl -X POST ${ROUTER_URL}/v1/enroll \\
  -H "Content-Type: application/json" \\
  -d '{"id": "my-pds", "url": "https://pds.example.com"}'

# → {"status": "pending", "submit_token": "…"}   keep it — shown only once`;

const PUSH_SNIPPET = `# The script runs on YOUR machine — your admin password never leaves it.
# Python 3, standard library only.
curl -sO ${ROUTER_URL}/push-digests.py

PDS_URL=http://localhost:3000 \\
PDS_ADMIN_PASSWORD=... \\
ROUTER_URL=${ROUTER_URL} \\
INSTANCE_ID=my-pds \\
SUBMIT_TOKEN=... \\
python3 push-digests.py

# then put the same command on a timer, e.g. cron every 5 minutes:
# */5 * * * *  cd /opt/pds && PDS_URL=... SUBMIT_TOKEN=... python3 push-digests.py`;

const LOOKUP_SNIPPET = `curl -X POST ${ROUTER_URL}/v1/lookup \\
  -H "Authorization: Bearer $ROUTER_CLIENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "maya@example.com"}'

# → {"instances":[{"id":"my-pds","url":"https://pds.example.com"}]}`;

const INTEGRATE_SNIPPET = `const res = await fetch("${ROUTER_URL}/v1/lookup", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.ROUTER_CLIENT_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email }),
});
const { instances } = await res.json();

if (instances.length === 1) {
  // One home — start the ePDS email login there.
  startLogin(instances[0].url, email);
} else if (instances.length > 1) {
  // Several homes — let the user pick which account to use.
  showAccountChooser(instances);
} else {
  // No home yet — offer to create an account on your default server.
  startSignup(DEFAULT_PDS_URL, email);
}`;



export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.epdsRouter");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/ePDS-router"),
  };
}

// An interactive explainer for the ePDS router: why multi-server email
// login needs a discovery step, how the privacy-preserving fingerprint
// index works, and copy-paste commands for joining the network or
// integrating lookups into an app.
export default async function EpdsRouterDocsPage() {
  const t = await getTranslations("common.epdsRouter");

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-12 text-center">
        <div className="mb-5 flex justify-center text-primary">
          <LogoMark className="h-7 w-7" title="GainForest" />
        </div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {t("kicker")}
        </div>
        <h1 className="m-0 font-serif text-4xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mx-auto mt-4 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{t("lead")}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <FactCard icon={<SplitIcon className="h-4 w-4" />} title={t("facts.routing.title")} text={t("facts.routing.text")} />
        <FactCard
          icon={<FingerprintIcon className="h-4 w-4" />}
          title={t("facts.privacy.title")}
          text={t("facts.privacy.text")}
        />
        <FactCard
          icon={<PlugZapIcon className="h-4 w-4" />}
          title={t("facts.zerochange.title")}
          text={t("facts.zerochange.text")}
        />
      </section>

      <Section heading={t("problem.heading")}>
        <p className="max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("problem.p1")}</p>
        <p className="mt-4 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("problem.p2")}</p>
      </Section>

      <Section heading={t("demo.heading")} intro={t("demo.intro")}>
        <RouterLookupDemo />
      </Section>

      <Section heading={t("sync.heading")} intro={t("sync.intro")}>
        <SyncJourney />
      </Section>

      <Section heading={t("register.heading")} intro={t("register.intro")}>
        <p className="mb-5 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("register.p1")}</p>
        <CodeSnippet code={ENROLL_SNIPPET} label={t("register.enrollLabel")} />
        <div className="mt-4">
          <CodeSnippet code={PUSH_SNIPPET} label={t("register.pushLabel")} />
        </div>
        <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">{t("register.approveNote")}</p>
      </Section>

      <Section heading={t("integrate.heading")} intro={t("integrate.intro")}>
        <CodeSnippet code={LOOKUP_SNIPPET} label={t("integrate.lookupLabel")} />
        <div className="mt-4">
          <CodeSnippet code={INTEGRATE_SNIPPET} label={t("integrate.jsLabel")} />
        </div>
        <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">{t("integrate.cacheTip")}</p>
      </Section>

      <Section heading={t("api.heading")} intro={t("api.intro")}>
        <div className="overflow-hidden rounded-xl border border-border/60">
          <table className="w-full border-collapse text-left">
            <tbody>
              <ApiRow method="POST" path="/v1/lookup" text={t("api.lookup")} />
              <ApiRow method="GET" path="/v1/status" text={t("api.status")} />
              <ApiRow method="POST" path="/v1/enroll" text={t("api.enroll")} />
              <ApiRow method="PUT" path="/v1/instances/:id/digests" text={t("api.digests")} />
              <ApiRow method="GET" path="/push-digests.py" text={t("api.script")} />
              <ApiRow method="POST" path="/v1/instances/:id/approve" text={t("api.approve")} />
              <ApiRow method="DELETE" path="/v1/instances/:id" text={t("api.unregister")} />
            </tbody>
          </table>
        </div>
      </Section>

      <section className="mt-16 border-t border-border/60 pt-10">
        <h2 className="m-0 mb-5 font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("more.heading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/docs/ePDS"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.epdsTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.epdsDesc")}</p>
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.githubTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.githubDesc")}</p>
          </a>
        </div>
      </section>
    </div>
  );
}

function Section({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 first:mt-0">
      <h2 className="m-0 font-serif text-xl font-semibold tracking-tight text-foreground">{heading}</h2>
      {intro && <p className="mt-2 mb-6 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{intro}</p>}
      {!intro && <div className="mb-6" />}
      {children}
    </section>
  );
}

function FactCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-4 py-3.5">
      <div className="mb-1.5 flex items-center gap-2 text-primary">
        {icon}
        <span className="text-[13px] font-medium text-foreground">{title}</span>
      </div>
      <p className="m-0 text-[12.5px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function ApiRow({ method, path, text }: { method: string; path: string; text: string }) {
  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-primary">{method}</td>
      <td className="whitespace-nowrap px-2 py-2.5 pr-4 font-mono text-[11.5px] text-foreground/90">{path}</td>
      <td className="w-full px-4 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">{text}</td>
    </tr>
  );
}
