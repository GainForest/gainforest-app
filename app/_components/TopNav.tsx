import Link from "next/link";
import { LogoMark } from "./Logo";
import { SignInPopover } from "./SignInPopover";
import { getSession } from "../_lib/auth-session";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

const NAV = [
  { label: "Globe", href: GLOBE_URL, external: true },
  { label: "Bumicerts", href: `${BUMICERTS_URL}/explore`, external: true },
  { label: "For Communities", href: `${BUMICERTS_URL}/organizations`, external: true },
  { label: "For Supporters", href: `${BUMICERTS_URL}/leaderboard`, external: true },
  { label: "About", href: "https://www.gainforest.earth", external: true },
];

export async function TopNav() {
  const session = await getSession();
  const did = session?.did ?? null;
  // Best-effort handle resolution — we fetch the DID document directly so
  // we don't need a logged-in agent. Failure is fine: the popover gracefully
  // falls back to "Signed in" without a handle.
  let handle: string | null = null;
  if (did) {
    try {
      const docUrl = did.startsWith("did:plc:")
        ? `https://plc.directory/${did}`
        : did.startsWith("did:web:")
          ? `https://${did.slice("did:web:".length)}/.well-known/did.json`
          : null;
      if (docUrl) {
        const res = await fetch(docUrl, {
          next: { revalidate: 300 },
        });
        if (res.ok) {
          const doc = (await res.json()) as {
            alsoKnownAs?: string[];
          };
          const aka = doc.alsoKnownAs?.find((s) => s.startsWith("at://"));
          if (aka) handle = aka.slice("at://".length);
        }
      }
    } catch {
      // ignore — popover handles null handle
    }
  }
  return (
    <header className="w-full border-b border-border-soft">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between px-12">
        <Link href="/" className="flex items-center gap-2.5" aria-label="GainForest — home">
          <LogoMark className="h-7 w-7 text-primary" title="GainForest" />
          <span className="font-garamond text-[22px] font-semibold tracking-tight text-foreground">
            GainForest
          </span>
        </Link>

        <nav className="hidden items-center gap-12 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              {...(item.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className="text-[15px] font-normal text-foreground/85 transition-colors hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <SignInPopover signedIn={!!session} handle={handle} />
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-[15px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
