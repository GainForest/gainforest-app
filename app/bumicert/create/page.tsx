import { redirect } from "next/navigation";

export default function LegacyCreateBumicertPage() {
  redirect("/manage/certs/new");
}
