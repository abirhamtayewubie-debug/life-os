import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="6" className="fill-primary" />
        <circle cx="12" cy="12" r="5.25" fill="none" strokeWidth="1.6" className="stroke-primary-foreground" />
        <circle cx="12" cy="12" r="1.6" className="fill-brand" />
        <path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4" strokeWidth="1.6" strokeLinecap="round" className="stroke-primary-foreground/60" />
      </svg>
      {withText && <span className="text-[15px] font-semibold tracking-tight">Life OS</span>}
    </span>
  );
}
