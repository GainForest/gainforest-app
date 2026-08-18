import { redirect } from "next/navigation";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { accountNewCertPath } from "@/app/account/_lib/account-route";

export default async function LegacyCreateBumicertPage() {
  const target = await resolvePersonalManageTarget();
  redirect(target ? accountNewCertPath(target.identifier) : "/manage/certs/new");
}
