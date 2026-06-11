export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-screen bg-background text-foreground">
      {children}
    </section>
  );
}
