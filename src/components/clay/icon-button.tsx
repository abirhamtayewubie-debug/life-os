import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/** The 44px card-colored squircle used for search, bell, back and more buttons. */
export const iconButtonClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-card text-foreground shadow-clay transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-[0.97] [&_svg]:size-5 [&_svg]:shrink-0";

export function IconButton({ className, asChild = false, ...props }: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(iconButtonClass, className)} {...(asChild ? {} : { type: "button" })} {...props} />;
}

/** Initial letter on a sage-tint squircle. */
export function Avatar({ initial, className }: { initial: string; className?: string }) {
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-tint-sage text-sm font-semibold text-foreground shadow-clay", className)} aria-hidden>
      {initial}
    </span>
  );
}

export function initialFor(name: string | null, email: string | null, demo: boolean) {
  if (demo) return "D";
  return ((name ?? email ?? "Y").trim()[0] ?? "Y").toUpperCase();
}
