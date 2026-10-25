import { cn } from "@/lib/utils";

/** Page title in Fraunces with an optional italic accent word: "Your *money*". */
export function PageHeader({ title, accent, accentTone = "clay", description, actions, eyebrow, className, titleClassName }: {
  title: string;
  accent?: string;
  accentTone?: "clay" | "sage";
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className={cn("min-w-0", titleClassName)}>
        {eyebrow && <div className="label-caps mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[34px] leading-[1.05] font-normal tracking-[-0.01em] text-balance sm:text-[40px]">
          {title}
          {accent && <> <span className={accentTone === "sage" ? "accent-italic-sage" : "accent-italic"}>{accent}</span></>}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground max-md:hidden">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
