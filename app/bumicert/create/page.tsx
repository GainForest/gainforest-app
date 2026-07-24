import { redirect } from "next/navigation";

// The legacy creator is retired. Keep one canonical entry point so permissions,
// copy, and project-plus-Cert creation cannot drift into separate flows.
export default function LegacyCreateBumicertPage() {
  redirect("/cert/create");
}
