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
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-1.5 py-5" : "gap-2 py-10", className)}>
      {Icon && (
        <div className="mb-1 flex size-9 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
          <Icon className="size-4" />
        </div>
      )}
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {children && <div className="max-w-xs text-xs leading-relaxed text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
