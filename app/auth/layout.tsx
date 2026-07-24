export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-dvh bg-background text-foreground">
      {children}
    </section>
  );
}
