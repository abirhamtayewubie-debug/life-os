"use client";

import { useTheme } from "next-themes";
import { useMounted } from "@/lib/use-mounted";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const opts = [
    { v: "light", label: "Light", icon: Sun },
    { v: "dark", label: "Dark", icon: Moon },
    { v: "system", label: "System", icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
      {opts.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={mounted && theme === o.v}
          onClick={() => setTheme(o.v)}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-border px-3 py-3 text-xs transition-colors hover:bg-muted",
            mounted && theme === o.v && "border-brand bg-accent text-accent-foreground",
          )}
        >
          <o.icon className="size-4" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}
