import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="10" className="fill-primary" />
        <circle cx="16" cy="16" r="7.5" fill="none" strokeWidth="2.2" className="stroke-primary-foreground" />
        <path d="M16 8.5V16l4.5 2.8" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground" />
        <circle cx="16" cy="16" r="1.9" className="fill-brand" />
      </svg>
      {withText && <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Life OS</span>}
    </span>
  );
}
