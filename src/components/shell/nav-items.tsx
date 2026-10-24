"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUILT_THROUGH_PHASE, NAV_MODULES, MODULE_GROUP_LABELS, type ModuleGroup } from "@/lib/modules";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/**
 * Sidebar module list. Below `lg` it is always an icon rail (tablets); `collapsed`
 * keeps it a rail on desktop too. Settings lives in the sidebar footer instead.
 */
export function NavItems({
  hidden,
  collapsed = false,
  counts = {},
}: {
  hidden: string[];
  collapsed?: boolean;
  counts?: Record<string, string>;
}) {
  const pathname = usePathname();
  const groups = Object.keys(MODULE_GROUP_LABELS) as ModuleGroup[];
  const railOnly = collapsed ? "" : "lg:hidden"; // shown only while the rail is showing
  const wideOnly = collapsed ? "hidden" : "max-lg:hidden";

  return (
    <nav aria-label="Modules" className="flex flex-col gap-5">
      {groups.map((group) => {
        const items = NAV_MODULES.filter((m) => m.key !== "settings" && m.group === group && (m.required || !hidden.includes(m.key)));
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <div className={cn("label-caps px-3.5 pb-1.5", wideOnly)}>{MODULE_GROUP_LABELS[group]}</div>
            {group !== "overview" && <div className={cn("mx-auto mb-1 h-px w-6 bg-border", railOnly)} aria-hidden />}
            {items.map((m) => {
              const active = isActivePath(pathname, m.href);
              const count = counts[m.key];
              return (
                <Tooltip key={m.key}>
                  <TooltipTrigger asChild>
                    <Link
                      href={m.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-11 items-center gap-3 rounded-[14px] px-3.5 text-foreground/80 transition-[background-color,color] duration-150 hover:bg-tint-mist hover:text-foreground",
                        active && "bg-card text-foreground shadow-clay hover:bg-card",
                        collapsed ? "justify-center px-0" : "max-lg:justify-center max-lg:px-0",
                      )}
                    >
                      <m.icon className={cn("size-5 shrink-0 text-muted-foreground group-hover:text-foreground", active && "text-foreground")} strokeWidth={1.6} aria-hidden />
                      <span className={cn("truncate font-display text-[16px]", collapsed ? "sr-only" : "max-lg:sr-only")}>{m.label}</span>
                      {m.phase > BUILT_THROUGH_PHASE && (
                        <span className={cn("ml-auto text-[10px] text-muted-foreground tabular", wideOnly)} title={`Arrives in phase ${m.phase}`}>P{m.phase}</span>
                      )}
                      {count && !active && <span className={cn("ml-auto text-[13px] text-subtle-foreground tabular", wideOnly)}>{count}</span>}
                      {active && (
                        <span
                          className={cn("ml-auto size-1.5 shrink-0 rounded-full bg-clay", collapsed ? "absolute top-2 right-2" : "max-lg:absolute max-lg:top-2 max-lg:right-2")}
                          aria-hidden
                        />
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className={railOnly}>{m.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
