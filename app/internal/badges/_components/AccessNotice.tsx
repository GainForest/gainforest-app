import { ShieldAlertIcon } from "lucide-react";
import { AuthButton } from "@/app/_components/AuthFlow";

export function AccessNotice({ title, description, showAuthButton = false }: { title: string; description: string; showAuthButton?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-3 py-12 text-foreground sm:px-5">
      <section className="max-w-lg rounded-3xl bg-card p-4 text-center sm:p-6">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlertIcon className="size-6" />
        </div>
        <h1 className="mt-5 font-instrument text-4xl font-light italic tracking-[-0.04em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        {showAuthButton ? (
          <div className="mt-6 flex justify-center">
            <AuthButton session={{ isLoggedIn: false }} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
