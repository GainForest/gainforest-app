import Image from "next/image";
import Link from "next/link";
import { ExternalLinkIcon, FileTextIcon, GlobeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GAINFOREST_URL, STATUS_URL } from "../_lib/urls";

const PRIMARY_LINKS = [
  { href: GAINFOREST_URL, key: "gainforest", Icon: GlobeIcon, external: true },
  { href: "https://docs.gainforest.earth", key: "documentation", Icon: FileTextIcon, external: true },
  { href: "https://bsky.app/profile/gainforest.earth", key: "bluesky", Icon: BlueskyIcon, external: true },
  { href: "https://www.instagram.com/gainforest", key: "instagram", Icon: InstagramIcon, external: true },
  { href: "https://github.com/GainForest/gainforest-explorer", key: "github", Icon: GithubIcon, external: true },
] as const;

const DATA_LINKS = [
  { href: "/projects", key: "projects" },
  { href: "/organizations", key: "organizations" },
  { href: "/observations", key: "observations" },
  { href: "/bioblitz", key: "bioblitz" },
  { href: "/docs/lexicons", key: "lexicons" },
  { href: "/globe", key: "greenGlobe" },
  { href: STATUS_URL, key: "status" },
] as const;

// Mixed footer: GainForest's light, minimal brand block plus the explorer's data
// source/legal details and GainForest social presence.
export function Footer() {
  const t = useTranslations("common.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto mt-auto w-full max-w-6xl border-t border-border px-6 py-16">
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
              <Link href="/privacy" className="underline-offset-4 transition-colors hover:text-primary hover:underline">
                {t("links.privacyPolicy")}
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

function BlueskyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.31.975.975 1.248 2.242 1.31 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.335 2.633-1.31 3.608-.975.975-2.242 1.248-3.608 1.31-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.335-3.608-1.31-.975-.975-1.248-2.242-1.31-3.608C2.174 15.584 2.163 15.204 2.163 12s.011-3.584.07-4.85c.061-1.366.334-2.633 1.309-3.608.975-.974 2.242-1.248 3.608-1.31 1.266-.058 1.646-.07 4.85-.07Zm0 1.802c-3.15 0-3.517.011-4.76.068-1.045.048-1.613.222-1.99.369-.5.194-.858.427-1.233.802-.375.375-.608.732-.802 1.233-.147.377-.321.945-.369 1.99-.057 1.243-.068 1.61-.068 4.76s.011 3.517.068 4.76c.048 1.045.222 1.613.369 1.99.194.5.427.858.802 1.233.375.375.732.608 1.233.802.377.147.945.321 1.99.369 1.243.057 1.61.068 4.76.068s3.517-.011 4.76-.068c1.045-.048 1.613-.222 1.99-.369.5-.194.858-.427 1.233-.802.375-.375.608-.732.802-1.233.147-.377.321-.945.369-1.99.057-1.243.068-1.61.068-4.76s-.011-3.517-.068-4.76c-.048-1.045-.222-1.613-.369-1.99a3.32 3.32 0 0 0-.802-1.233 3.32 3.32 0 0 0-1.233-.802c-.377-.147-.945-.321-1.99-.369-1.243-.057-1.61-.068-4.76-.068Zm0 3.063a4.972 4.972 0 1 1 0 9.944 4.972 4.972 0 0 1 0-9.944Zm0 1.802a3.17 3.17 0 1 0 0 6.34 3.17 3.17 0 0 0 0-6.34Zm5.18-3.132a1.162 1.162 0 1 1 0 2.324 1.162 1.162 0 0 1 0-2.324Z" />
    </svg>
  );
}
