"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUILT_THROUGH_PHASE, MODULES, MODULE_GROUP_LABELS, type ModuleGroup } from "@/lib/modules";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function NavItems({
  hidden,
  collapsed = false,
  onNavigate,
}: {
  hidden: string[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = Object.keys(MODULE_GROUP_LABELS) as ModuleGroup[];

  return (
    <nav aria-label="Modules" className="flex flex-col gap-6">
      {groups.map((group) => {
        const items = MODULES.filter((m) => m.group === group && (m.required || !hidden.includes(m.key)));
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-0.5">
            {!collapsed && (
              <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-subtle-foreground uppercase">
                {MODULE_GROUP_LABELS[group]}
              </div>
            )}
            {collapsed && group !== "overview" && <div className="mx-auto mb-1 h-px w-5 bg-sidebar-border" />}
            {items.map((m) => {
              const active = isActivePath(pathname, m.href);
              const link = (
                <Link
                  key={m.key}
                  href={m.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-[10px] px-3 text-sm text-sidebar-foreground transition-[background-color,color,box-shadow] duration-150 hover:bg-sidebar-accent hover:text-foreground",
                    active && "bg-sidebar-active font-medium text-foreground shadow-card hover:bg-sidebar-active",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <m.icon className={cn("size-[18px] shrink-0 text-subtle-foreground group-hover:text-foreground", active && "text-brand group-hover:text-brand")} strokeWidth={1.8} aria-hidden />
                  {collapsed ? <span className="sr-only">{m.label}</span> : <span className="truncate">{m.label}</span>}
                  {!collapsed && m.phase > BUILT_THROUGH_PHASE && (
                    <span className="ml-auto text-[10px] text-muted-foreground tabular" title={`Arrives in phase ${m.phase}`}>
                      P{m.phase}
                    </span>
                  )}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={m.key}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{m.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
