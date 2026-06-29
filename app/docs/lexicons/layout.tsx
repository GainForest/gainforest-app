import { getTranslations } from "next-intl/server";
import { SideNav, type NavGroup } from "./_components/SideNav";
import { GROUPS } from "./_lib/registry";
import { shortName } from "./_lib/types";

// No brand bar — just a sticky table-of-contents rail beside a centered content
// column, so the docs sit naturally inside the app shell.
export default async function LexiconsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common.docs");

  const navGroups: NavGroup[] = GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    items: g.lexicons.map((l) => ({ id: l.id, name: shortName(l.id) })),
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl items-start gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:gap-14">
      <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-44 shrink-0 overflow-y-auto pb-10 lg:block">
        <SideNav groups={navGroups} overviewLabel={t("overview")} ariaLabel={t("sectionsAria")} />
      </aside>

      <main className="min-w-0 max-w-3xl flex-1">{children}</main>
    </div>
  );
}
