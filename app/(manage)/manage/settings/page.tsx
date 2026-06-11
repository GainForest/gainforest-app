import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AccountSettingsSections } from "@/app/account/_components/AccountSettingsSections";
import Container from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Settings — GainForest",
  description: "Manage your GainForest account settings.",
  robots: { index: false, follow: false },
};

export default async function ManageSettingsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  return (
    <Container className="pt-4 pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage account links, security, and export tools.</p>
      </div>
      <AccountSettingsSections did={session.did} />
    </Container>
  );
}
