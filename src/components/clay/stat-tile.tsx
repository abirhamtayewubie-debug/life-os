import { cn } from "@/lib/utils";
import { TINT_BG, type Tint } from "./tile";

/** A tinted number tile: small caps label, Fraunces value, optional hint. */
export function StatTile({ label, value, hint, tint = "card", className }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tint?: Tint;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1 rounded-[22px] p-3.5 shadow-clay sm:p-4", TINT_BG[tint], className)}>
      <span className="label-caps break-words">{label}</span>
      <span className="tabular truncate font-display text-[26px] leading-tight font-normal tracking-[-0.01em]">{value}</span>
      {hint && <span className="truncate text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export const STAT_TINTS: Tint[] = ["sand", "sage", "clay", "mist"];
