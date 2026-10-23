import { cn } from "@/lib/utils";

/** The Orbit mark: a ring with an iris point moving forward. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="18" className="fill-primary" />
      <circle cx="32" cy="32" r="14" fill="none" strokeWidth="4.5" className="stroke-primary-foreground" />
      <circle cx="42" cy="22" r="7" className="fill-primary" />
      <circle cx="42" cy="22" r="4.6" className="fill-brand" />
    </svg>
  );
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {withText && <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Life OS</span>}
    </span>
  );
}
