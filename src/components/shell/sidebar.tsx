"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NavItems } from "./nav-items";

export const SIDEBAR_COOKIE = "lifeos_sidebar";

export function Sidebar({ hidden, initialCollapsed }: { hidden: string[]; initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[3.75rem]" : "w-60",
      )}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        <Link href="/" className="rounded-md outline-none" aria-label="Life OS home">
          <Logo withText={!collapsed} />
        </Link>
      </div>
      <div className={cn("flex-1 overflow-y-auto px-2 pb-4", collapsed && "px-2")}>
        <NavItems hidden={hidden} collapsed={collapsed} />
      </div>
      <div className={cn("border-t border-sidebar-border p-2", collapsed && "flex justify-center")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size={collapsed ? "icon-sm" : "sm"} onClick={toggle} className="w-full justify-start text-muted-foreground" aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <PanelLeft />
              {!collapsed && <span>Collapse</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand" : "Collapse"} sidebar <span className="opacity-60">([)</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
