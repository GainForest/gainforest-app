import Link from "next/link";
import { LogoMark } from "./Logo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-12 py-4 text-[13px]">
        <div className="flex items-center gap-3">
          <LogoMark className="h-6 w-6 text-primary" title="GainForest" />
          <span className="font-garamond text-[18px] font-semibold text-foreground">
            GainForest
          </span>
          <span className="ml-4 text-foreground/55">
            © {year} GainForest. All rights reserved.
          </span>
        </div>
        <nav className="flex items-center gap-10 text-foreground/80">
          <Link href="https://gainforest.app" target="_blank" rel="noreferrer">
            Globe
          </Link>
          <Link
            href="https://alpha.fund.gainforest.app/explore"
            target="_blank"
            rel="noreferrer"
          >
            Bumicerts
          </Link>
          <Link
            href="https://github.com/GainForest/bumicerts-monorepo"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </Link>
          <Link
            href="https://www.gainforest.earth"
            target="_blank"
            rel="noreferrer"
          >
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
