import Image from "next/image";
import Link from "next/link";
import { ExternalLinkIcon, FileTextIcon, GlobeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GAINFOREST_URL, GLOBE_URL, STATUS_URL } from "../_lib/urls";

const PRIMARY_LINKS = [
  { href: GAINFOREST_URL, key: "gainforest", Icon: GlobeIcon, external: true },
  { href: "https://docs.fund.gainforest.app/", key: "documentation", Icon: FileTextIcon, external: true },
  { href: "https://www.x.com/GainForestNow", key: "twitter", Icon: TwitterIcon, external: true },
  { href: "https://github.com/GainForest/gainforest-explorer", key: "github", Icon: GithubIcon, external: true },
] as const;

const DATA_LINKS = [
  { href: "/certs", key: "bumicerts" },
  { href: "/organizations", key: "organizations" },
  { href: "/observations", key: "observations" },
  { href: "/leaderboard", key: "leaderboard" },
  { href: GLOBE_URL, key: "greenGlobe" },
  { href: STATUS_URL, key: "status" },
] as const;

// Mixed footer: GainForest's light, minimal brand block plus the explorer's data
// source/legal details and GainForest social presence.
export function Footer() {
  const t = useTranslations("common.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto max-w-7xl border-t border-border px-6 py-16">
      <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-start">
        <div className="max-w-xl">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <Image
                src="/assets/media/images/app-icon.png"
                alt={t("brandAlt")}
                width={28}
                height={28}
                className="drop-shadow-md"
              />
              <span className="font-serif text-xl font-bold tracking-tight">GainForest</span>
            </div>
            <p
              className="text-sm text-muted-foreground"
              style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
            >
              {t("tagline")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {t("builtWith")}
            </p>
          </div>

          <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground" aria-label={t("dataCollectionsAria")}>
            {DATA_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.href.startsWith("http") ? "_blank" : undefined}
                rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                className="transition-colors hover:text-foreground"
              >
                {t(`links.${link.key}`)}
              </Link>
            ))}
          </nav>
        </div>

        <nav className="flex flex-col gap-1" aria-label={t("footerLinksAria")}>
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <link.Icon className="h-3.5 w-3.5" />
              <span>{t(`links.${link.key}`)}</span>
              {link.external && <ExternalLinkIcon className="h-3 w-3 opacity-50" />}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground/50">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1.5 leading-[1.55]">
            <span>
              © {year} {t("copyright")}
            </span>
            <span>
              <span className="font-medium text-muted-foreground/80">GainForest e.V.</span>
              <span className="text-muted-foreground/35"> · </span>
              Schwandenacker 35, 8052 Zurich, Switzerland
            </span>
            <span>
              {t("nonprofit")}
              <span className="text-muted-foreground/35"> · </span>
              <Link
                href="https://www.uid.admin.ch/Detail.aspx?uid_id=CHE181901605"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                {t("swissRegistration")}
              </Link>
              <span className="text-muted-foreground/35"> · </span>
              <Link href="mailto:team@gainforest.net" className="underline-offset-4 transition-colors hover:text-primary hover:underline">
                team@gainforest.net
              </Link>
            </span>
          </div>
          <span className="text-[12px] text-muted-foreground/40">
            {t("bottomTagline")}
          </span>
        </div>
      </div>
    </footer>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
