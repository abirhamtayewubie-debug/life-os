import { Logo } from "@/components/shell/logo";

const PREVIEW = [
  { title: "Finalise logo concepts", meta: "Due 3:00 PM · Work", done: true },
  { title: "Send site photos to engineer", meta: "Today · Work", done: false },
  { title: "English speaking practice", meta: "Evening · Learning", done: false },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-xs text-subtle-foreground">Private by design. Your records are isolated to your account by the database itself.</p>
      </div>
      <div className="relative hidden overflow-hidden bg-inverse p-3 text-inverse-foreground lg:block" aria-hidden>
        <div className="absolute -top-40 -right-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(139_140_255/0.28),transparent)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="ml-auto w-full max-w-sm rounded-[28px] bg-white/6 p-6 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur">
            <p className="text-xs font-semibold tracking-[0.1em] text-inverse-accent uppercase">Today</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.025em]">Your top three</p>
            <ul className="mt-4 grid gap-3">
              {PREVIEW.map((p) => (
                <li key={p.title} className="flex items-center gap-3">
                  <span className={p.done ? "flex size-5 items-center justify-center rounded-full bg-inverse-accent" : "size-5 rounded-full border-[1.5px] border-white/30"} />
                  <span>
                    <span className={p.done ? "block text-sm text-inverse-muted line-through" : "block text-sm"}>{p.title}</span>
                    <span className="block text-xs text-inverse-muted">{p.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="max-w-lg font-display text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">
              Understand your life, prioritise what matters, and turn goals into consistent action.
            </p>
            <div className="mt-8 flex gap-6 text-sm text-inverse-muted">
              <span>Plan</span><span>Track</span><span>Reflect</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
