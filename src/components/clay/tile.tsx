import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tint = "clay" | "sage" | "sand" | "mist" | "card";

export const TINT_BG: Record<Tint, string> = {
  clay: "bg-tint-clay",
  sage: "bg-tint-sage",
  sand: "bg-tint-sand",
  mist: "bg-tint-mist",
  card: "bg-card",
};

/** Areas tile: a round icon chip, a Fraunces name and one line of live status. */
export function AreaTile({ href, icon: Icon, name, status, tint = "card", className }: {
  href: string;
  icon: LucideIcon;
  name: string;
  status?: React.ReactNode;
  tint?: Tint;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[148px] min-w-0 flex-col items-center justify-center gap-2 rounded-[22px] px-2 py-4 text-center shadow-clay transition-transform active:scale-[0.98]",
        TINT_BG[tint],
        className,
      )}
    >
      <span className={cn("flex size-[42px] items-center justify-center rounded-full", tint === "card" ? "bg-tint-mist" : "bg-card")}>
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
      </span>
      <span className="mt-1 max-w-full truncate font-display text-[15px] leading-tight">{name}</span>
      {status && <span className="max-w-full truncate text-[11px] text-muted-foreground">{status}</span>}
    </Link>
  );
}
