"use client";

import { cn } from "@/lib/utils";

export type PillTab<T extends string> = { v: T; label: string; count?: number };

/** Page-level view switcher: a row of rounded chips that scrolls sideways on phones. */
export function PillTabs<T extends string>({ label, items, value, onChange, className }: {
  label: string;
  items: readonly PillTab<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mx-5 max-w-[calc(100%+2.5rem)] overflow-x-auto px-5 pb-1 md:mx-0 md:max-w-full md:px-0", className)}>
      <div role="tablist" aria-label={label} className="flex w-max gap-1.5">
        {items.map((t) => (
          <button key={t.v} type="button" role="tab" aria-selected={value === t.v} onClick={() => onChange(t.v)}
            className={cn("h-10 cursor-pointer rounded-full border border-border px-4 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-tint-mist", value === t.v && "border-transparent bg-primary text-primary-foreground hover:bg-primary")}>
            {t.label}
            {t.count !== undefined && <span className={cn("tabular ml-1.5 text-[11px]", value === t.v ? "opacity-70" : "text-subtle-foreground")}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
