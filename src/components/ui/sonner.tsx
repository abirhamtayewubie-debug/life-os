"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border !rounded-lg !shadow-lg !text-[13px]",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
