import { redirect } from "next/navigation";

// The standalone Certs catalog has been merged into Projects: every project now
// carries exactly one impact certificate, so Projects is the single catalog.
export default function CertsRedirectPage() {
  redirect("/projects");
}
