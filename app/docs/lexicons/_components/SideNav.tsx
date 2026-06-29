"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { lexiconHref } from "../_lib/types";

export interface NavGroup {
  id: string;
  title: string;
  items: { id: string; name: string }[];
}

const BASE = "/docs/lexicons";

// A borderless table of contents — it reads as part of the content, not a
// second app sidebar. Active rows carry a thin accent rail.
export function SideNav({
  groups,
  overviewLabel,
  ariaLabel,
}: {
  groups: NavGroup[];
  overviewLabel: string;
  ariaLabel: string;
}) {
  const pathname = stripLocaleFromPathname(usePathname() ?? BASE);
  const activeId = pathname.startsWith(`${BASE}/`)
    ? decodeURIComponent(pathname.slice(BASE.length + 1))
    : null;
  const overviewActive = pathname === BASE;

  return (
    <nav aria-label={ariaLabel} className="text-sm">
      <Link
        href={BASE}
        className={cn(
          "mb-5 block pl-3 text-[13px] no-underline transition-colors",
          overviewActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {overviewLabel}
      </Link>

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="mb-2 pl-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50">
              {g.title}
            </div>
            <ul className="m-0 list-none p-0">
              {g.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <li key={item.id}>
                    <Link
                      href={lexiconHref(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block border-l-2 py-[3px] pl-2.5 font-mono text-[12px] leading-relaxed no-underline transition-colors",
                        active
                          ? "border-primary font-medium text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
