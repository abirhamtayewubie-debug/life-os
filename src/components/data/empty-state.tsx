import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  compact = false,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-1.5 py-6" : "gap-2.5 py-14", className)}>
      {Icon && (
        <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <p className="font-display text-base font-semibold tracking-[-0.015em] text-foreground">{title}</p>
      {children && <div className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
