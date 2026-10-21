import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-xs text-subtle-foreground">Private by design. Your records are isolated to your account by the database itself.</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-border bg-surface-2 lg:block" aria-hidden>
        <div className="absolute inset-0 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px] opacity-70" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md text-2xl font-semibold tracking-tight text-balance">Understand your life, prioritise what matters, and turn goals into consistent action.</p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-xs text-muted-foreground">
            {["Plan", "Track", "Reflect"].map((w, i) => (
              <div key={w} className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-6 h-1 w-8 rounded-full" style={{ background: `var(--color-chart-${i + 1})` }} />
                {w}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
