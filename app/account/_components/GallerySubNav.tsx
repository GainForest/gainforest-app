"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { ImageIcon, PaperclipIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { accountAttachmentsPath, accountGalleryPath } from "../_lib/account-route";

type SubTabKey = "photos" | "files";

interface SubTab {
  labelKey: SubTabKey;
  href: string;
  icon: React.ElementType;
}

/**
 * Secondary navigation for the "Files & photos" tab. Photo galleries and other
 * file attachments are both `org.hypercerts.context.attachment` records, so they
 * live under one tab: Photos shows the image galleries (with the uploader),
 * Files lists documents, datasets and links.
 */
export function GallerySubNav({ identifier }: { identifier: string }) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");

  const tabs: SubTab[] = [
    { labelKey: "photos", href: accountGalleryPath(identifier), icon: ImageIcon },
    { labelKey: "files", href: accountAttachmentsPath(identifier), icon: PaperclipIcon },
  ];

  function isActive(tab: SubTab): boolean {
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }

  return (
    <div className="mt-4 -mx-4 overflow-x-auto scrollbar-hidden px-4">
      <div className="flex min-w-max items-center gap-1.5">
        {tabs.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.labelKey}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap select-none",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
