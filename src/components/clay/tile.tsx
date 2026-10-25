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

/** Areas tile: a round icon chip, a Fraunces name and live status (one line on phones, up to three on desktop). */
export function AreaTile({ href, icon: Icon, name, status = [], tint = "card", className }: {
  href: string;
  icon: LucideIcon;
  name: string;
  status?: string[];
  tint?: Tint;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[148px] min-w-0 flex-col items-center justify-center gap-2 rounded-[22px] px-2 py-4 text-center shadow-clay transition-transform active:scale-[0.98] lg:min-h-[196px] lg:justify-start lg:px-3 lg:pt-6",
        TINT_BG[tint],
        className,
      )}
    >
      <span className={cn("flex size-[42px] items-center justify-center rounded-full", tint === "card" ? "bg-tint-mist" : "bg-card")}>
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
      </span>
      <span className="mt-1 max-w-full truncate font-display text-[15px] leading-tight">{name}</span>
      {status.length > 0 && (
        <span className="flex max-w-full flex-col gap-0.5 text-[11px] text-muted-foreground lg:text-[12px]">
          {status.slice(0, 3).map((line, i) => (
            <span key={i} className={cn("truncate", i > 0 && "hidden lg:block")}>{line}</span>
          ))}
        </span>
      )}
    </Link>
  );
}
