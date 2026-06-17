import { redirect } from "next/navigation";

export default function LegacyManageBumicertsPage() {
  redirect("/manage/certs");
}
