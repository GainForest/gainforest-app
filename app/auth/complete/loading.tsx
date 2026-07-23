import { getTranslations } from "next-intl/server";
import { Loader2Icon } from "lucide-react";

export default async function AuthCompleteLoading() {
  const t = await getTranslations("legacy");
  return (
    <div className="fixed inset-0 flex items-center justify-center" role="status" aria-label={t("authSigningIn")}>
      <Loader2Icon className="size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
    </div>
  );
}
