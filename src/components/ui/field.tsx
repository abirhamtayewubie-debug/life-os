import { cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + error/hint, with the ids wired for screen readers. */
export function Field({
  id, label, error, hint, optional, className, children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {described(children, error ? `${id}-error` : hint ? `${id}-hint` : undefined)}
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : hint ? <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Links the error or hint to the control so screen readers announce it with the field. */
function described(children: React.ReactNode, describedBy: string | undefined) {
  if (!describedBy || !isValidElement<{ "aria-describedby"?: string }>(children)) return children;
  const own = children.props["aria-describedby"];
  return cloneElement(children, { "aria-describedby": own ? `${own} ${describedBy}` : describedBy });
}
