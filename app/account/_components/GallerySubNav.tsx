"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { ImageIcon, PaperclipIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { accountAttachmentsPath, accountGalleryPath } from "../_lib/account-route";
import { ProfileSegmentedNavigation } from "./ProfileListSkeleton";

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Shared Photos / Files navigation for the account attachment surface. */
export function GallerySubNav({ identifier }: { identifier: string }) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const photosHref = accountGalleryPath(identifier);
  const filesHref = accountAttachmentsPath(identifier);

  return (
    <div className="mt-4 -mx-4 overflow-x-auto px-4 scrollbar-hidden">
      <ProfileSegmentedNavigation
        ariaLabel={t("filesAndPhotos")}
        className="mb-0"
        segments={[
          {
            href: photosHref,
            active: pathMatches(pathname, photosHref),
            label: <><ImageIcon className="size-3.5" aria-hidden />{t("photos")}</>,
          },
          {
            href: filesHref,
            active: pathMatches(pathname, filesHref),
            label: <><PaperclipIcon className="size-3.5" aria-hidden />{t("files")}</>,
          },
        ]}
      />
    </div>
  );
}
