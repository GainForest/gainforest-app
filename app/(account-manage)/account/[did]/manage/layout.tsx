import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import { accountPath } from "@/app/account/_lib/account-route";
import { ManageDashboard } from "@/app/(manage)/manage/_components/ManageDashboard";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { SignInPrompt } from "@/app/_components/AuthFlow";
import Container from "@/components/ui/container";

function safeDecode(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function GroupNotMemberMessage({ name }: { name: string }) {
  return (
    <Container className="flex min-h-[50vh] items-center justify-center py-12">
      <section className="max-w-xl rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Organization access</p>
        <h1 className="mt-3 font-instrument text-3xl font-light italic tracking-[-0.02em] text-foreground">
          {name === "this organization" ? "You’re not a member of this organization" : `You’re not a member of ${name}`}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This manage page is only available to members of the organization. Ask an owner or admin to add you, or switch to another organization you belong to.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Back to GainForest
          </Link>
        </div>
      </section>
    </Container>
  );
}

export default async function AccountManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ did: string }>;
}) {
  const { did } = await params;
  const access = await resolveAccountManageAccess(safeDecode(did));

  if (access.status === "signed-out") {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-sm items-center px-3 py-12">
        <SignInPrompt />
      </section>
    );
  }
  if (access.status === "forbidden") redirect(accountPath(access.identifier));
  if (access.status === "not-found") notFound();
  if (access.status === "not-member") {
    return <GroupNotMemberMessage name={access.group.displayName?.trim() || "this organization"} />;
  }

  const target = access.target;
  const session = await fetchAuthSession();
  const groupRole: CgsRole | undefined = target.kind === "group"
    ? target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member"
    : undefined;

  return (
    <ManageDashboard
      account={access.account}
      basePath={target.basePath}
      writeRepoDid={target.kind === "group" ? target.did : undefined}
      groupRole={groupRole}
      currentUserDid={target.currentUserDid ?? (session.isLoggedIn ? session.did : null)}
      recoveryEmail={session.isLoggedIn ? session.email ?? null : null}
    >
      {children}
    </ManageDashboard>
  );
}
